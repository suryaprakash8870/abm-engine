/**
 * Core service for the TAL Manager engine (#05).
 *
 * Implements the doc's "Step-by-step job":
 *   1. loadScoredList      — load the scored/tiered accounts to consider
 *   2. applySuppression     — drop customers / closed-lost / do-not-contact / unsubscribed
 *   3. createTalVersion     — upsert the head TAL + replace membership + snapshot a version
 *   4. resolveReviewStatus  — reviewed vs unreviewed (don't block the pipeline)
 *   5. requestCrmSync       — queue CRM property + active-list writes (fulfilled by Engine 10)
 *   6. buildTalSummary      — tier counts for the event payload
 *
 * Owned tables: target_account_lists, tal_accounts, tal_versions, suppression_list,
 * crm_audience_sync_log.
 *
 * NOTE (cross-engine reads): loadScoredList reads account_scores (Engine 04) and
 * enriched_accounts (Engine 03) directly. This follows the established MVP pattern
 * (see Engine 04) and is covered by the deferred "local snapshot" refactor — it is
 * NOT a new exception.
 */

import { Prisma } from '@prisma/client';
import { prisma } from '../../db/client';
import type { AccountId, Tier } from '../../events';

// ── Types ──────────────────────────────────────────────────────────────────────

/** A scored account loaded for TAL assembly. */
export interface ScoredAccount {
  accountId: AccountId;
  tier: Tier; // only tiered accounts (1|2|3) reach here — untiered are excluded
  score: number;
  domain: string | null;
  name: string | null;
}

/** Result of applying suppression rules to a scored list. */
export interface SuppressionResult {
  /** Accounts that survive suppression and belong on the active TAL. */
  activeAccounts: ScoredAccount[];
  /** Account ids removed by suppression (still retained in suppression_list). */
  suppressedAccountIds: AccountId[];
}

/** A freshly created (or idempotently reused) immutable TAL version. */
export interface TalVersionResult {
  talId: string;
  versionNumber: number;
  accountCount: number;
  tier1Count: number;
  tier2Count: number;
  tier3Count: number;
  /** true when this correlation id was already processed (no new version cut). */
  reused: boolean;
}

/** Everything the handler needs to run the completion check + build the event. */
export interface TalFinalizationResult {
  talId: string;
  versionNumber: number;
  accountCount: number;
  tier1Count: number;
  tier2Count: number;
  tier3Count: number;
  suppressedCount: number;
  reviewStatus: 'reviewed' | 'unreviewed';
  status: string;
  // completion-check facts
  suppressionApplied: boolean;
  talVersionCreated: boolean;
  crmRequested: boolean;
}

// ── Step 1 — load the scored list ───────────────────────────────────────────────

/**
 * Load scored/tiered accounts for the workspace. Untiered accounts (tier === null,
 * i.e. below the tier3 floor) are excluded — they are not targets. When `accountIds`
 * is given the result is restricted to those ids (the event path); otherwise every
 * tiered account in the workspace is loaded (the manual-finalize path).
 */
export async function loadScoredList(
  workspaceId: string,
  accountIds?: AccountId[],
): Promise<ScoredAccount[]> {
  // Distinguish "manual finalize" (accountIds === undefined → all tiered accounts)
  // from "event carried zero scored accounts" (accountIds === [] → empty TAL).
  if (accountIds !== undefined && accountIds.length === 0) return [];

  const scores = await prisma.accountScore.findMany({
    where: {
      workspaceId,
      tier: { not: null },
      ...(accountIds ? { accountId: { in: accountIds } } : {}),
    },
    select: { accountId: true, tier: true, totalScore: true },
  });
  if (scores.length === 0) return [];

  // Snapshot company name/domain from enriched_accounts for display + export.
  // account_scores.accountId holds the enriched_accounts PRIMARY KEY (cuid) — set by
  // Engine 04 — so the join is on enriched_accounts.id (NOT enriched_accounts.accountId).
  const enriched = await prisma.enrichedAccount.findMany({
    where: { workspaceId, id: { in: scores.map((s) => s.accountId) } },
    select: { id: true, name: true, domain: true },
  });
  const meta = new Map(enriched.map((e) => [e.id, e]));

  // Defensive: the WHERE excludes null tiers; never let a non-1/2/3 tier onto the TAL
  // (keeps account_count == tier1 + tier2 + tier3).
  return scores
    .filter((s) => s.tier === 1 || s.tier === 2 || s.tier === 3)
    .map((s) => ({
      accountId: s.accountId,
      tier: s.tier as Tier,
      score: s.totalScore,
      domain: meta.get(s.accountId)?.domain ?? null,
      name: meta.get(s.accountId)?.name ?? null,
    }));
}

// ── Step 2 — suppression ─────────────────────────────────────────────────────────

/**
 * Partition the scored list into active (kept) vs suppressed. An account is
 * suppressed when an active suppression entry matches its domain or account id.
 * "Active" = no expiry, or an expiry still in the future.
 */
export async function applySuppression(
  workspaceId: string,
  accounts: ScoredAccount[],
): Promise<SuppressionResult> {
  const now = new Date();
  const entries = await prisma.suppressionEntry.findMany({
    where: {
      workspaceId,
      OR: [{ suppressedUntil: null }, { suppressedUntil: { gt: now } }],
    },
    select: { domain: true, accountId: true },
  });

  const suppressedDomains = new Set(
    entries.map((e) => e.domain?.toLowerCase()).filter((d): d is string => !!d),
  );
  const suppressedAccountIds = new Set(
    entries.map((e) => e.accountId).filter((a): a is string => !!a),
  );

  const activeAccounts: ScoredAccount[] = [];
  const removed: AccountId[] = [];
  for (const a of accounts) {
    const domainHit = a.domain ? suppressedDomains.has(a.domain.toLowerCase()) : false;
    const idHit = suppressedAccountIds.has(a.accountId);
    if (domainHit || idHit) removed.push(a.accountId);
    else activeAccounts.push(a);
  }
  return { activeAccounts, suppressedAccountIds: removed };
}

// ── Step 3 — immutable version ───────────────────────────────────────────────────

function tierCounts(accounts: ScoredAccount[]): { t1: number; t2: number; t3: number } {
  let t1 = 0;
  let t2 = 0;
  let t3 = 0;
  for (const a of accounts) {
    if (a.tier === 1) t1++;
    else if (a.tier === 2) t2++;
    else if (a.tier === 3) t3++;
  }
  return { t1, t2, t3 };
}

/**
 * Upsert the workspace's head TAL, replace its membership with `activeAccounts`,
 * and snapshot an immutable version. Idempotent: if `correlationId` was already
 * processed, the existing version is returned and no new version is cut.
 */
export async function createTalVersion(
  workspaceId: string,
  activeAccounts: ScoredAccount[],
  suppressedCount: number,
  correlationId?: string,
): Promise<TalVersionResult> {
  // Idempotency guard — a retried event must not cut a duplicate version.
  if (correlationId) {
    const existing = await prisma.talVersion.findFirst({
      where: { workspaceId, sourceCorrelationId: correlationId },
      orderBy: { versionNumber: 'desc' },
    });
    if (existing) {
      const snap = (existing.snapshot ?? {}) as Record<string, number>;
      return {
        talId: existing.talId,
        versionNumber: existing.versionNumber,
        accountCount: Number(snap.accountCount ?? activeAccounts.length),
        tier1Count: Number(snap.tier1Count ?? 0),
        tier2Count: Number(snap.tier2Count ?? 0),
        tier3Count: Number(snap.tier3Count ?? 0),
        reused: true,
      };
    }
  }

  const { t1, t2, t3 } = tierCounts(activeAccounts);

  // Atomic: bump the head version + replace membership + snapshot the version in ONE
  // transaction, so a partial failure can never leave the head version ahead of its
  // snapshots (which would make a retry skip a version number). The unique constraint
  // on (workspace_id, source_correlation_id) makes a concurrent duplicate event fail
  // here rather than cut a second version — the retry then hits the reuse guard above.
  const { talId, versionNumber } = await prisma.$transaction(async (tx) => {
    const head = await tx.targetAccountList.upsert({
      where: { workspaceId },
      create: { workspaceId, version: 1, accountCount: activeAccounts.length, status: 'finalized' },
      update: { version: { increment: 1 }, accountCount: activeAccounts.length, status: 'finalized' },
    });

    const snapshot = {
      accountCount: activeAccounts.length,
      tier1Count: t1,
      tier2Count: t2,
      tier3Count: t3,
      suppressedCount,
      accounts: activeAccounts.map((a) => ({ accountId: a.accountId, tier: a.tier, score: a.score, domain: a.domain })),
    };

    await tx.talAccount.deleteMany({ where: { workspaceId, talId: head.id } });
    if (activeAccounts.length > 0) {
      await tx.talAccount.createMany({
        data: activeAccounts.map((a) => ({
          workspaceId,
          talId: head.id,
          accountId: a.accountId,
          domain: a.domain,
          name: a.name,
          tier: a.tier,
          score: a.score,
        })),
      });
    }
    await tx.talVersion.create({
      data: {
        workspaceId,
        talId: head.id,
        versionNumber: head.version,
        snapshot: snapshot as unknown as Prisma.InputJsonValue,
        sourceCorrelationId: correlationId ?? null,
      },
    });

    return { talId: head.id, versionNumber: head.version };
  });

  return { talId, versionNumber, accountCount: activeAccounts.length, tier1Count: t1, tier2Count: t2, tier3Count: t3, reused: false };
}

// ── Step 4 — review status ───────────────────────────────────────────────────────

/** Reviewed vs unreviewed for the head TAL. Never blocks the pipeline (doc). */
export async function resolveReviewStatus(
  workspaceId: string,
  _talId: string,
): Promise<'reviewed' | 'unreviewed'> {
  const head = await prisma.targetAccountList.findUnique({
    where: { workspaceId },
    select: { reviewStatus: true },
  });
  return head?.reviewStatus === 'reviewed' ? 'reviewed' : 'unreviewed';
}

// ── Step 5 — CRM sync request (fulfilled by Engine 10) ───────────────────────────

/**
 * Record the CRM property + active-list writes the TAL needs. We do NOT call the
 * CRM here (rule #8 — all CRM writes go through Engine 10). Engine 10 consumes the
 * `tal.finalized` event and fulfils these; this log is the durable request record.
 * Returns true once the requests are recorded (the engine has done its part).
 */
export async function requestCrmSync(
  workspaceId: string,
  talId: string,
  _activeAccounts: ScoredAccount[],
): Promise<{ confirmed: boolean }> {
  // Clear any stale queued requests for this TAL, then enqueue the current set.
  await prisma.crmAudienceSyncLog.deleteMany({ where: { workspaceId, talId, status: 'queued' } });
  await prisma.crmAudienceSyncLog.createMany({
    data: [
      { workspaceId, talId, platform: 'hubspot_property', audience: null, status: 'queued', detail: 'ICP tier + score property writes' },
      { workspaceId, talId, platform: 'hubspot_list', audience: 'Tier 1', status: 'queued' },
      { workspaceId, talId, platform: 'hubspot_list', audience: 'Tier 2', status: 'queued' },
      { workspaceId, talId, platform: 'hubspot_list', audience: 'All ABM', status: 'queued' },
    ],
  });
  return { confirmed: true };
}

// ── Orchestrator ─────────────────────────────────────────────────────────────────

/**
 * Run the full step-by-step job for a workspace. Used by the `accounts.scored`
 * handler (with the event's account ids + correlation id) and by the manual
 * POST /api/v1/tal/finalize route (no account ids → all tiered accounts).
 */
export async function finalizeTal(
  workspaceId: string,
  opts: { accountIds?: AccountId[]; correlationId?: string } = {},
): Promise<TalFinalizationResult> {
  const scored = await loadScoredList(workspaceId, opts.accountIds);
  const { activeAccounts, suppressedAccountIds } = await applySuppression(workspaceId, scored);
  const version = await createTalVersion(workspaceId, activeAccounts, suppressedAccountIds.length, opts.correlationId);
  const reviewStatus = await resolveReviewStatus(workspaceId, version.talId);
  // On an idempotent retry the version (and its CRM sync requests) already exist —
  // don't delete + recreate the queued rows, which would churn Engine 10's work.
  const crm = version.reused ? { confirmed: true } : await requestCrmSync(workspaceId, version.talId, activeAccounts);

  return {
    talId: version.talId,
    versionNumber: version.versionNumber,
    accountCount: version.accountCount,
    tier1Count: version.tier1Count,
    tier2Count: version.tier2Count,
    tier3Count: version.tier3Count,
    suppressedCount: suppressedAccountIds.length,
    reviewStatus,
    status: 'finalized',
    suppressionApplied: true,
    talVersionCreated: true,
    crmRequested: crm.confirmed,
  };
}

// ── Read / API support ───────────────────────────────────────────────────────────

/** Current head TAL + its active accounts (GET /api/v1/tal). */
export async function getCurrentTal(workspaceId: string) {
  const head = await prisma.targetAccountList.findUnique({ where: { workspaceId } });
  if (!head) return null;
  const accounts = await prisma.talAccount.findMany({
    where: { talId: head.id },
    orderBy: [{ tier: 'asc' }, { score: 'desc' }],
  });
  return {
    id: head.id,
    name: head.name,
    version: head.version,
    account_count: head.accountCount,
    status: head.status,
    review_status: head.reviewStatus,
    updated_at: head.updatedAt.toISOString(),
    accounts: accounts.map((a) => ({
      account_id: a.accountId,
      name: a.name,
      domain: a.domain,
      tier: a.tier,
      score: a.score,
    })),
  };
}

/** Immutable version history (GET /api/v1/tal/versions). */
export async function listTalVersions(workspaceId: string) {
  const versions = await prisma.talVersion.findMany({
    where: { workspaceId },
    orderBy: { versionNumber: 'desc' },
    take: 50,
  });
  return versions.map((v) => {
    const snap = (v.snapshot ?? {}) as Record<string, number>;
    return {
      version_number: v.versionNumber,
      account_count: Number(snap.accountCount ?? 0),
      tier1_count: Number(snap.tier1Count ?? 0),
      tier2_count: Number(snap.tier2Count ?? 0),
      tier3_count: Number(snap.tier3Count ?? 0),
      suppressed_count: Number(snap.suppressedCount ?? 0),
      created_at: v.createdAt.toISOString(),
    };
  });
}

/** Add a suppression entry (POST /api/v1/tal/suppress). */
export async function addSuppression(
  workspaceId: string,
  input: { domain?: string; accountId?: string; reason: string; suppressedUntil?: string | null },
): Promise<{ id: string }> {
  if (!input.reason || !input.reason.trim()) throw new Error('A suppression reason is required.');
  if (!input.domain && !input.accountId) throw new Error('A domain or account id is required to suppress.');
  const row = await prisma.suppressionEntry.create({
    data: {
      workspaceId,
      domain: input.domain?.trim().toLowerCase() || null,
      accountId: input.accountId || null,
      reason: input.reason.trim(),
      suppressedUntil: input.suppressedUntil ? new Date(input.suppressedUntil) : null,
    },
  });
  return { id: row.id };
}

/** Build a CSV export of the current TAL (GET /api/v1/tal/export). */
export async function exportTalCsv(workspaceId: string): Promise<string> {
  const tal = await getCurrentTal(workspaceId);
  const header = 'company,domain,tier,score';
  if (!tal || tal.accounts.length === 0) return header + '\n';
  const esc = (v: unknown) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = tal.accounts.map((a) => [esc(a.name), esc(a.domain), a.tier, Math.round(a.score)].join(','));
  return [header, ...rows].join('\n') + '\n';
}
