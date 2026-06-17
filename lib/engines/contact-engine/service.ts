/**
 * Core service for the Contact Engine (#06).
 *
 * Sources + maps the buying committee per account:
 *   search (Apollo) → verify emails (Apollo) → assign roles (rule-based) →
 *   dedup + persist → queue CRM push (Engine 10) → build stakeholder map.
 *
 * Owned tables: contacts, stakeholder_maps, email_verification_results,
 * contact_crm_sync_log, sourcing_jobs.
 *
 * NOTE (cross-engine read): loadAccountsToProcess reads tal_accounts (Engine 05)
 * to get the finalised Tier-1/2 list — the established MVP pattern (see ADR-013),
 * covered by the deferred local-snapshot refactor.
 *
 * Role assignment is rule-based (deterministic, free) — the spec's Claude Haiku
 * classifier can be swapped into classifyRole() later (cf. Engine 03's rule-based
 * qualification fallback).
 *
 * @see ../../../docs/engines/engine-06-contact-engine.md
 */

import { prisma } from '../../db/client';
import { searchPeople, verifyEmail, type ApolloPerson } from '../../clients/apollo';
import type { AccountId, Tier } from '../../events';

export type StakeholderRole = 'decision_maker' | 'champion' | 'influencer';
export type EmailStatus = 'valid' | 'risky' | 'invalid' | 'unverified';

export interface StakeholderSearchCriteria {
  role: StakeholderRole;
  titles: string[];
  limit: number;
}

export interface SourcedContactRow {
  id: string;
  fullName: string;
  title: string;
  email: string | null;
  emailStatus: EmailStatus;
  role: StakeholderRole;
  roleConfidence: number;
  flaggedForReview: boolean;
}

export interface AccountSourcingResult {
  contactsFound: number;
  verifiedEmailCount: number;
  contacts: SourcedContactRow[];
  stakeholderMap: { dm: string[]; champion: string[]; influencer: string[] };
  // completion-check facts (per account)
  hasVerifiedRoleAssignedContact: boolean;
  allContactsHaveVerifiedEmailStatus: boolean;
  crmPushConfirmed: boolean;
}

// ── Step 2 — search criteria per role ────────────────────────────────────────

const ROLE_TITLES: Record<StakeholderRole, string[]> = {
  decision_maker: ['Chief Executive Officer', 'Chief Technology Officer', 'VP of Operations', 'Head of Growth'],
  champion: ['Director of Marketing', 'Director of Operations', 'Senior Manager'],
  influencer: ['Senior Analyst', 'Lead Specialist', 'Principal Consultant', 'Operations Manager'],
};

/** Per-role search criteria. Tier 1 gets a higher per-role cap (spec: up to 8/5). */
export function deriveSearchCriteria(tier: Tier): StakeholderSearchCriteria[] {
  const limit = tier === 1 ? 3 : 2;
  return (Object.keys(ROLE_TITLES) as StakeholderRole[]).map((role) => ({
    role,
    titles: ROLE_TITLES[role],
    limit,
  }));
}

// ── Step 6 — rule-based role assignment ──────────────────────────────────────

/**
 * Classify a title into a stakeholder role with a confidence. Swap in Haiku later.
 * The C-level abbreviations MUST be word-bounded — otherwise "cto" matches inside
 * "direCTOr" and a Director is mislabelled a decision-maker.
 */
export function classifyRole(title: string): { role: StakeholderRole; confidence: number } {
  const t = title.toLowerCase();
  if (/\b(ceo|cto|cfo|cmo|cio|coo|svp|evp|vp)\b|chief|vice president|head of|founder/.test(t)) {
    return { role: 'decision_maker', confidence: 0.9 };
  }
  if (/director|senior manager/.test(t)) return { role: 'champion', confidence: 0.82 };
  if (/manager|lead|principal|senior|staff|architect/.test(t)) return { role: 'influencer', confidence: 0.78 };
  return { role: 'influencer', confidence: 0.45 }; // unknown title → low confidence → flagged
}

// ── Step 1 — work list from the finalised TAL ────────────────────────────────

/** Tier-1 then Tier-2 accounts on the current TAL (Tier 3 is not contacted). */
export async function loadAccountsToProcess(
  workspaceId: string,
): Promise<Array<{ accountId: AccountId; tier: Tier; domain: string | null; name: string | null }>> {
  const rows = await prisma.talAccount.findMany({
    where: { workspaceId, tier: { in: [1, 2] } },
    orderBy: [{ tier: 'asc' }, { score: 'desc' }],
    select: { accountId: true, tier: true, domain: true, name: true },
  });
  return rows.map((r) => ({ accountId: r.accountId, tier: (r.tier as Tier) ?? 2, domain: r.domain, name: r.name }));
}

/** The tier + company identity for one account (POST /contacts/source). */
export async function getAccountForSourcing(
  workspaceId: string,
  accountId: AccountId,
): Promise<{ accountId: AccountId; tier: Tier; domain: string | null; name: string | null } | null> {
  const row = await prisma.talAccount.findFirst({
    where: { workspaceId, accountId },
    select: { accountId: true, tier: true, domain: true, name: true },
  });
  if (!row) return null;
  return { accountId: row.accountId, tier: (row.tier as Tier) ?? 2, domain: row.domain, name: row.name };
}

// ── Orchestrator — source one account's committee ────────────────────────────

export async function sourceAccountCommittee(
  workspaceId: string,
  accountId: AccountId,
  tier: Tier,
  domain: string | null,
  name: string | null,
  correlationId?: string,
): Promise<AccountSourcingResult> {
  // Idempotent job row: reuse the same run on a BullMQ retry (same correlationId)
  // instead of spawning a duplicate audit record.
  const job =
    (correlationId
      ? await prisma.sourcingJob.findFirst({ where: { workspaceId, accountId, correlationId } })
      : null) ??
    (await prisma.sourcingJob.create({
      data: { workspaceId, accountId, tier, status: 'running', correlationId: correlationId ?? null },
    }));

  const empty: AccountSourcingResult = {
    contactsFound: 0,
    verifiedEmailCount: 0,
    contacts: [],
    stakeholderMap: { dm: [], champion: [], influencer: [] },
    hasVerifiedRoleAssignedContact: false,
    allContactsHaveVerifiedEmailStatus: true,
    crmPushConfirmed: false,
  };

  try {
    // Steps 3 — search Apollo per role.
    const searchDomain = domain || `${(name ?? 'account').toLowerCase().replace(/[^a-z0-9]/g, '')}.example.com`;
    const criteria = deriveSearchCriteria(tier);
    const found: ApolloPerson[] = [];
    for (const c of criteria) {
      const people = await searchPeople(searchDomain, name ?? searchDomain, c.titles, c.limit);
      found.push(...people);
    }

    // Step 7 — dedup by email; drop records with no email (can't verify or push).
    // Type guard narrows email to `string` for the upsert (its compound-unique key).
    const seen = new Set<string>();
    const deduped = found.filter((p): p is ApolloPerson & { email: string } => {
      if (!p.email) return false;
      const key = p.email.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    if (deduped.length === 0) {
      await prisma.sourcingJob.update({ where: { id: job.id, workspaceId }, data: { status: 'no_contacts', completedAt: new Date() } });
      return empty;
    }

    // Steps 5 + 6 — verify + classify. Done OUTSIDE the DB transaction (external
    // network calls must not hold a transaction open).
    let verifiedCount = 0;
    const prepared = [] as Array<{ p: ApolloPerson & { email: string }; status: EmailStatus; bounceRisk: number; role: StakeholderRole; confidence: number; flagged: boolean }>;
    for (const p of deduped) {
      const verify = await verifyEmail(p.email);
      if (verify.status === 'valid') verifiedCount++;
      const cls = classifyRole(p.title);
      prepared.push({ p, status: verify.status, bounceRisk: verify.bounceRisk, role: cls.role, confidence: cls.confidence, flagged: cls.confidence < 0.75 });
    }

    // Steps 4/8/9 — persist EVERYTHING atomically (contacts + verifications + map +
    // CRM-sync requests + job). Idempotent on retry: per-contact verification/sync
    // rows are replaced, not appended; a partial failure rolls the whole run back.
    const rows = await prisma.$transaction(async (tx) => {
      const out: SourcedContactRow[] = [];
      for (const item of prepared) {
        const { p } = item;
        const contact = await tx.contact.upsert({
          where: { workspaceId_accountId_email: { workspaceId, accountId, email: p.email } },
          create: {
            workspaceId, accountId, fullName: p.fullName, title: p.title, seniority: p.seniority,
            department: p.department, linkedinUrl: p.linkedinUrl, email: p.email, emailStatus: item.status,
            stakeholderRole: item.role, roleConfidence: item.confidence, flaggedForReview: item.flagged,
          },
          update: {
            fullName: p.fullName, title: p.title, seniority: p.seniority, department: p.department,
            linkedinUrl: p.linkedinUrl, emailStatus: item.status, stakeholderRole: item.role,
            roleConfidence: item.confidence, flaggedForReview: item.flagged,
          },
        });
        // One verification row per contact (replace prior → idempotent across retries).
        await tx.emailVerificationResult.deleteMany({ where: { workspaceId, contactId: contact.id } });
        await tx.emailVerificationResult.create({ data: { workspaceId, contactId: contact.id, status: item.status, bounceRisk: item.bounceRisk } });
        out.push({ id: contact.id, fullName: p.fullName, title: p.title, email: p.email, emailStatus: item.status, role: item.role, roleConfidence: item.confidence, flaggedForReview: item.flagged });
      }

      const dm = out.filter((r) => r.role === 'decision_maker').map((r) => r.id);
      const champion = out.filter((r) => r.role === 'champion').map((r) => r.id);
      const influencer = out.filter((r) => r.role === 'influencer').map((r) => r.id);
      await tx.stakeholderMap.upsert({
        where: { workspaceId_accountId: { workspaceId, accountId } },
        create: { workspaceId, accountId, dmContactIds: dm, championContactIds: champion, influencerContactIds: influencer },
        update: { dmContactIds: dm, championContactIds: champion, influencerContactIds: influencer },
      });

      // CRM push request (Engine 10 fulfils it on contacts.mapped; ADR-013).
      const ids = out.map((r) => r.id);
      await tx.contactCrmSyncLog.deleteMany({ where: { workspaceId, contactId: { in: ids }, status: 'queued' } });
      await tx.contactCrmSyncLog.createMany({ data: out.map((r) => ({ workspaceId, contactId: r.id, status: 'queued', detail: `${r.role} · ${r.emailStatus}` })) });

      await tx.sourcingJob.update({ where: { id: job.id, workspaceId }, data: { status: 'completed', contactsFound: out.length, completedAt: new Date() } });
      return out;
    });

    return {
      contactsFound: rows.length,
      verifiedEmailCount: verifiedCount,
      contacts: rows,
      stakeholderMap: { dm: rows.filter((r) => r.role === 'decision_maker').map((r) => r.id), champion: rows.filter((r) => r.role === 'champion').map((r) => r.id), influencer: rows.filter((r) => r.role === 'influencer').map((r) => r.id) },
      // "verified, role-assigned" = a deliverable (valid/risky) email + a confident role.
      hasVerifiedRoleAssignedContact: rows.some((r) => (r.emailStatus === 'valid' || r.emailStatus === 'risky') && !r.flaggedForReview),
      allContactsHaveVerifiedEmailStatus: rows.every((r) => r.emailStatus === 'valid' || r.emailStatus === 'risky' || r.emailStatus === 'invalid'),
      crmPushConfirmed: true,
    };
  } catch (err) {
    await prisma.sourcingJob.update({ where: { id: job.id, workspaceId }, data: { status: 'failed', error: String(err), completedAt: new Date() } });
    throw err;
  }
}

// ── Read / API support ───────────────────────────────────────────────────────

/** Contacts for one account, grouped by role (GET /contacts/account/:id). */
export async function getContactsForAccount(workspaceId: string, accountId: AccountId) {
  const contacts = await prisma.contact.findMany({
    where: { workspaceId, accountId },
    orderBy: [{ roleConfidence: 'desc' }],
  });
  const shape = (c: (typeof contacts)[number]) => ({
    id: c.id,
    full_name: c.fullName,
    title: c.title,
    email: c.email,
    email_status: c.emailStatus,
    linkedin_url: c.linkedinUrl,
    role: c.stakeholderRole,
    role_confidence: c.roleConfidence,
    flagged_for_review: c.flaggedForReview,
  });
  return {
    account_id: accountId,
    decision_makers: contacts.filter((c) => c.stakeholderRole === 'decision_maker').map(shape),
    champions: contacts.filter((c) => c.stakeholderRole === 'champion').map(shape),
    influencers: contacts.filter((c) => c.stakeholderRole === 'influencer').map(shape),
    total: contacts.length,
  };
}

/** Tier-1/2 accounts with their contact counts (the /contacts index). */
export async function listAccountsWithContacts(workspaceId: string) {
  const accounts = await prisma.talAccount.findMany({
    where: { workspaceId, tier: { in: [1, 2] } },
    orderBy: [{ tier: 'asc' }, { score: 'desc' }],
    select: { accountId: true, name: true, domain: true, tier: true },
  });
  const counts = await prisma.contact.groupBy({
    by: ['accountId'],
    where: { workspaceId, accountId: { in: accounts.map((a) => a.accountId) } },
    _count: { accountId: true },
  });
  const countMap = new Map(counts.map((c) => [c.accountId, c._count.accountId]));
  return accounts.map((a) => ({
    account_id: a.accountId,
    name: a.name,
    domain: a.domain,
    tier: a.tier,
    contact_count: countMap.get(a.accountId) ?? 0,
  }));
}

/** Move a contact to a different role, then rebuild that account's stakeholder map. */
export async function updateContactRole(workspaceId: string, contactId: string, role: StakeholderRole): Promise<void> {
  const contact = await prisma.contact.findFirst({ where: { id: contactId, workspaceId }, select: { id: true, accountId: true } });
  if (!contact) throw new Error('Contact not found');
  await prisma.contact.update({ where: { id: contactId, workspaceId }, data: { stakeholderRole: role, flaggedForReview: false } });
  await rebuildStakeholderMap(workspaceId, contact.accountId);
}

/** Manually add a contact (POST /contacts/manual), then rebuild the map. */
export async function addManualContact(
  workspaceId: string,
  input: { account_id: string; full_name: string; title?: string; email?: string; role?: StakeholderRole },
): Promise<{ id: string }> {
  if (!input.account_id || !input.full_name?.trim()) throw new Error('account_id and full_name are required.');
  const role = input.role ?? (input.title ? classifyRole(input.title).role : 'influencer');
  const verify = input.email ? await verifyEmail(input.email) : { status: 'unverified' as const, bounceRisk: 0 };
  const base = { workspaceId, accountId: input.account_id, fullName: input.full_name.trim(), title: input.title ?? null, email: input.email ?? null, emailStatus: verify.status, stakeholderRole: role, roleConfidence: 1, flaggedForReview: false };

  // Upsert (dedup by email) only when an email is present — email is the compound
  // unique key and can't be null in it. Without an email we always create.
  const contact = input.email
    ? await prisma.contact.upsert({
        where: { workspaceId_accountId_email: { workspaceId, accountId: input.account_id, email: input.email } },
        create: base,
        update: { fullName: base.fullName, title: base.title, stakeholderRole: role },
      })
    : await prisma.contact.create({ data: base });

  await rebuildStakeholderMap(workspaceId, input.account_id);
  return { id: contact.id };
}

/** Recompute a stakeholder_maps row from the current contacts of an account. */
async function rebuildStakeholderMap(workspaceId: string, accountId: string): Promise<void> {
  const contacts = await prisma.contact.findMany({ where: { workspaceId, accountId }, select: { id: true, stakeholderRole: true } });
  const byRole = (r: StakeholderRole) => contacts.filter((c) => c.stakeholderRole === r).map((c) => c.id);
  await prisma.stakeholderMap.upsert({
    where: { workspaceId_accountId: { workspaceId, accountId } },
    create: { workspaceId, accountId, dmContactIds: byRole('decision_maker'), championContactIds: byRole('champion'), influencerContactIds: byRole('influencer') },
    update: { dmContactIds: byRole('decision_maker'), championContactIds: byRole('champion'), influencerContactIds: byRole('influencer') },
  });
}
