/**
 * Core service for the Contact Engine (#06).
 *
 * Implements the doc's "Step-by-step job" as discrete, testable steps. Every
 * function here is a stub: body is `// TODO(owner)` plus a typed return or a
 * `throw new Error('not implemented')`. Prisma models are referenced ONLY in
 * comments (they do not exist yet — see prisma/schema/contact-engine.prisma).
 *
 * Owned tables (no other engine queries these directly):
 *   - contacts, stakeholder_maps, email_verification_results,
 *     contact_crm_sync_log, sourcing_jobs
 *
 * @see ../../../docs/engines/engine-06-contact-engine.md
 */

import type {
  AccountId,
  ContactId,
  IsoTimestamp,
  TalFinalizedPayload,
  Tier,
} from '../../events';

/** One stakeholder role we source candidates for. */
export type StakeholderRole = 'decision_maker' | 'champion' | 'influencer';

/** Verified email deliverability status (failure handling: never silently drop 'risky'). */
export type EmailStatus = 'valid' | 'risky' | 'invalid' | 'unverified';

/** Search criteria derived from the ICP buyer persona for a single role. */
export interface StakeholderSearchCriteria {
  role: StakeholderRole;
  titles: string[];
  seniorities: string[];
  departments: string[];
  /** Max candidates per role: 5 normally, 8 for Tier 1. */
  limit: number;
}

/** A contact candidate enriched from Apollo (pre-CRM, pre-role-assignment). */
export interface ContactCandidate {
  contactId: ContactId;
  fullName: string;
  title: string;
  seniority: string | null;
  department: string | null;
  linkedinUrl: string | null;
  email: string | null;
}

/** Outcome of verifying a single contact's email via Apollo. */
export interface EmailVerificationResult {
  contactId: ContactId;
  status: EmailStatus;
  bounceRisk: number;
  verifiedAt: IsoTimestamp;
}

/** A role assignment produced by Claude Haiku (or flagged for manual review). */
export interface RoleAssignment {
  contactId: ContactId;
  role: StakeholderRole;
  confidence: number;
  /** True when confidence is below threshold and the assignment is flagged. */
  flaggedForReview: boolean;
}

/** The assembled committee for one account. */
export interface StakeholderMap {
  accountId: AccountId;
  dmContactIds: ContactId[];
  championContactIds: ContactId[];
  influencerContactIds: ContactId[];
}

/** A per-account sourcing job row. */
export interface SourcingJob {
  jobId: string;
  accountId: AccountId;
  tier: Tier;
  status: string;
  contactsFound: number;
  startedAt: IsoTimestamp;
}

/**
 * Step 1 — Receive `tal.finalized`; load the accounts to process, Tier 1 first,
 * then Tier 2 within the contact limit. Returns an ordered work list.
 */
export async function loadAccountsToProcess(
  _workspaceId: string,
  _payload: TalFinalizedPayload,
): Promise<Array<{ accountId: AccountId; tier: Tier }>> {
  // TODO(owner): query the finalised TAL (Tier 1 then Tier 2) within contact limits.
  throw new Error('not implemented');
}

/**
 * Step 1b — Open a `sourcing_jobs` row for an account so progress is trackable
 * and the work is idempotent on retry.
 */
export async function startSourcingJob(
  _workspaceId: string,
  _accountId: AccountId,
  _tier: Tier,
): Promise<SourcingJob> {
  // TODO(owner): insert a sourcing_jobs row (status='running').
  throw new Error('not implemented');
}

/**
 * Step 2 — Derive stakeholder search criteria from the ICP buyer persona
 * (titles, seniorities, departments) per role. Tier 1 gets a higher per-role cap.
 */
export async function deriveSearchCriteria(
  _workspaceId: string,
  _tier: Tier,
): Promise<StakeholderSearchCriteria[]> {
  // TODO(owner): read the ICP buyer persona (Engine 01 local copy) → per-role criteria.
  throw new Error('not implemented');
}

/**
 * Step 3 — Search Apollo for DM / Champion / Influencer candidates per account
 * (up to 5 per role, 8 for Tier 1). Failure handling: no contacts → flag the
 * account for manual entry (caller publishes `contacts.sourcing_failed`).
 */
export async function searchCandidates(
  _workspaceId: string,
  _accountId: AccountId,
  _criteria: StakeholderSearchCriteria[],
): Promise<ContactCandidate[]> {
  // TODO(owner): Apollo People Search by company + title; cap per role/tier.
  throw new Error('not implemented');
}

/**
 * Step 4 — Enrich each contact (name, title, LinkedIn, email, phone, seniority).
 * Sparse records may be enriched via Claude Haiku and flagged 'inferred'.
 */
export async function enrichContacts(
  _workspaceId: string,
  _candidates: ContactCandidate[],
): Promise<ContactCandidate[]> {
  // TODO(owner): enrich via Apollo; infer sparse fields via Haiku (flag 'inferred').
  throw new Error('not implemented');
}

/**
 * Step 5 — Verify every email via Apollo before CRM upload. Failure handling:
 * 'risky' is included with a warning, never silently dropped.
 */
export async function verifyEmails(
  _workspaceId: string,
  _candidates: ContactCandidate[],
): Promise<EmailVerificationResult[]> {
  // TODO(owner): Apollo email verify per contact → email_verification_results rows.
  throw new Error('not implemented');
}

/**
 * Step 6 — Assign stakeholder roles via Claude Haiku (batched 20 per call).
 * confidence > 0.75 → auto-assign; below → flag for review; < 0.5 → flag all
 * candidates for manual assignment (failure handling).
 */
export async function assignStakeholderRoles(
  _workspaceId: string,
  _candidates: ContactCandidate[],
): Promise<RoleAssignment[]> {
  // TODO(owner): batch-classify DM/champion/influencer via Claude Haiku 4.5.
  throw new Error('not implemented');
}

/**
 * Step 7 — Deduplicate against existing CRM contacts by email. Failure handling:
 * duplicate CRM contact → update existing, don't create a duplicate.
 */
export async function deduplicateAgainstCrm(
  _workspaceId: string,
  _candidates: ContactCandidate[],
): Promise<{ newContacts: ContactCandidate[]; existingContactIds: ContactId[] }> {
  // TODO(owner): match candidates to CRM contacts by email (via Engine 10 lookup).
  throw new Error('not implemented');
}

/**
 * Step 8 — Push contacts to the CRM with `abm_stakeholder_role` + context
 * properties via Engine 10 (never call the CRM directly). Awaits confirmation
 * and records each attempt in `contact_crm_sync_log`.
 */
export async function pushContactsToCrm(
  _workspaceId: string,
  _accountId: AccountId,
  _assignments: RoleAssignment[],
): Promise<{ confirmed: boolean }> {
  // TODO(owner): enqueue contact upserts with stakeholder-role props via Engine 10; await ack.
  throw new Error('not implemented');
}

/**
 * Step 9 — Assemble the per-account stakeholder map (DM / champion / influencer)
 * persisted into `stakeholder_maps`, ready for the `contacts.mapped` payload.
 */
export async function buildStakeholderMap(
  _workspaceId: string,
  _accountId: AccountId,
  _assignments: RoleAssignment[],
): Promise<StakeholderMap> {
  // TODO(owner): write stakeholder_maps row; group contact ids by role.
  throw new Error('not implemented');
}
