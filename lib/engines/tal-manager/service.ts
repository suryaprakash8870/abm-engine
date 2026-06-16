/**
 * Core service for the TAL Manager engine (#05).
 *
 * Implements the doc's "Step-by-step job" as discrete, testable steps. Every
 * function here is a stub: body is `// TODO(owner)` plus a typed return or a
 * `throw new Error('not implemented')`. Prisma models are referenced ONLY in
 * comments (they do not exist yet — see prisma/schema/tal-manager.prisma).
 *
 * Owned tables (no other engine queries these directly):
 *   - target_account_lists, tal_accounts, tal_versions, suppression_list,
 *     crm_audience_sync_log
 */

import type { AccountId, AccountsScoredPayload, IsoTimestamp, Tier } from '../../events';

/** A scored account loaded for TAL assembly. */
export interface ScoredAccount {
  accountId: AccountId;
  tier: Tier;
  score: number;
}

/** Result of applying suppression rules to a scored list. */
export interface SuppressionResult {
  /** Accounts that survive suppression and belong on the active TAL. */
  activeAccounts: ScoredAccount[];
  /** Account ids removed by suppression (still retained in suppression_list). */
  suppressedAccountIds: AccountId[];
}

/** A freshly created immutable TAL version. */
export interface TalVersion {
  talId: string;
  versionNumber: number;
  accountCount: number;
  status: string;
  createdAt: IsoTimestamp;
}

/** Per-platform outcome of an audience sync attempt (HubSpot, LinkedIn, ...). */
export interface AudienceSyncResult {
  platform: string;
  status: string;
  syncedAt: IsoTimestamp | null;
}

/**
 * Step 1 — Receive `accounts.scored`, load the full scored list.
 * Reads scored/tiered accounts for the workspace referenced by the event.
 */
export async function loadScoredList(
  _workspaceId: string,
  _payload: AccountsScoredPayload,
): Promise<ScoredAccount[]> {
  // TODO(owner): query the scored accounts referenced by payload.account_ids.
  throw new Error('not implemented');
}

/**
 * Step 2 — Apply suppression: existing customers, do-not-contact,
 * closed-lost within 6 months, unsubscribed.
 * Removes from active TAL but retains entries in the `suppression_list` table.
 */
export async function applySuppression(
  _workspaceId: string,
  _accounts: ScoredAccount[],
): Promise<SuppressionResult> {
  // TODO(owner): join against suppression_list; partition into active vs suppressed.
  throw new Error('not implemented');
}

/**
 * Step 3 — Create a new immutable TAL version with timestamp and account count.
 * Writes `target_account_lists` (+ tier rows in `tal_accounts`) and snapshots
 * the membership into `tal_versions.snapshot` (JSONB).
 */
export async function createTalVersion(
  _workspaceId: string,
  _activeAccounts: ScoredAccount[],
): Promise<TalVersion> {
  // TODO(owner): insert target_account_lists + tal_accounts + tal_versions rows.
  throw new Error('not implemented');
}

/**
 * Step 4 — Prompt the user to review Tier 1 if not yet done, or publish with a
 * 'pending review' flag. Returns the review status to stamp on the event.
 */
export async function resolveReviewStatus(
  _workspaceId: string,
  _talId: string,
): Promise<'reviewed' | 'unreviewed'> {
  // TODO(owner): check whether Tier 1 review is complete; default to 'unreviewed'.
  throw new Error('not implemented');
}

/**
 * Step 5 — Write ICP tier and score to CRM company records (via Engine 10).
 * Does NOT call the CRM directly — requests batched property writes through the
 * CRM Sync engine and awaits confirmation (failure handling: create missing
 * custom properties before writing; batch at a safe rate).
 */
export async function writeCrmCompanyProperties(
  _workspaceId: string,
  _activeAccounts: ScoredAccount[],
): Promise<{ confirmed: boolean }> {
  // TODO(owner): enqueue tier/score property writes via Engine 10; await ack.
  throw new Error('not implemented');
}

/**
 * Step 6 — Create HubSpot active lists (Tier 1, Tier 2, All ABM) that
 * auto-update. Records each attempt in `crm_audience_sync_log`.
 */
export async function createActiveLists(
  _workspaceId: string,
  _talId: string,
): Promise<AudienceSyncResult[]> {
  // TODO(owner): create/refresh HubSpot active lists via Engine 10; log results.
  throw new Error('not implemented');
}

/**
 * Step 7 — Queue Tier 1/2 domains for LinkedIn Matched Audience sync (v2).
 * Records the attempt in `crm_audience_sync_log`.
 */
export async function queueLinkedInAudienceSync(
  _workspaceId: string,
  _talId: string,
): Promise<AudienceSyncResult> {
  // TODO(owner): enqueue Tier 1/2 domains for LinkedIn Matched Audience (v2).
  throw new Error('not implemented');
}
