/**
 * Payload validation + task-completion check for the TAM Builder (engine 02).
 *
 * Two responsibilities (conventions.md):
 *   1. Cheap structural validation of every CONSUMED event payload, run before
 *      the handler does any work.
 *   2. `completionCheck` — encodes the doc's verbatim "Task completion check"
 *      list. The publisher emits `tam.search_completed` ONLY when this passes
 *      (verify-before-publish, ADR-003); otherwise the engine emits
 *      `tam.search_failed`.
 *
 * See docs/engines/engine-02-tam-builder.md.
 */

import type { IcpCreatedPayload } from '../../events';

/**
 * Structural guard for the `icp.created` payload (the engine's only trigger).
 * Keep this cheap — deep firmographic validation belongs in the service layer.
 */
export function validateIcpCreatedPayload(payload: unknown): payload is IcpCreatedPayload {
  if (typeof payload !== 'object' || payload === null) return false;
  const p = payload as Record<string, unknown>;
  return (
    typeof p.icp_id === 'string' &&
    p.icp_id.length > 0 &&
    typeof p.version === 'number' &&
    typeof p.mode === 'string' &&
    typeof p.firmographics === 'object' &&
    p.firmographics !== null
  );
}

/** Inputs the completion check inspects. Owner fills these from the job's final state. */
export interface CompletionCheckInput {
  /** True when every Apollo pagination page has been fetched and stored. */
  allPagesProcessed: boolean;
  /** Accounts actually persisted to `raw_account_list`. */
  totalAccountsStored: number;
  /** Count the search step expected to store (from `search_params_log`). */
  expectedCount: number;
  /** True when no duplicate (workspace_id, domain) survived the merge/dedupe. */
  domainsDeduplicated: boolean;
  /** True once `tam.search_completed` is published AND the broker confirmed it. */
  searchCompletedPublishedAndConfirmed: boolean;
}

export interface CompletionCheckResult {
  ok: boolean;
  failed: string[];
}

/**
 * Verbatim "Task completion check" from the engine doc. The engine marks its
 * work complete only when ALL of these are true; any failure means the engine
 * publishes `tam.search_failed` instead of `tam.search_completed`.
 */
export function completionCheck(input: CompletionCheckInput): CompletionCheckResult {
  const failed: string[] = [];

  // - [ ] All pagination pages processed
  if (!input.allPagesProcessed) {
    failed.push('All pagination pages processed');
  }
  // - [ ] Total accounts stored matches expected count
  if (input.totalAccountsStored !== input.expectedCount) {
    failed.push('Total accounts stored matches expected count');
  }
  // - [ ] Domains deduplicated (UNIQUE constraint on workspace_id + domain holds)
  if (!input.domainsDeduplicated) {
    failed.push('Domains deduplicated (UNIQUE constraint on workspace_id + domain holds)');
  }
  // - [ ] `tam.search_completed` event published and confirmed
  if (!input.searchCompletedPublishedAndConfirmed) {
    failed.push('`tam.search_completed` event published and confirmed');
  }

  return { ok: failed.length === 0, failed };
}
