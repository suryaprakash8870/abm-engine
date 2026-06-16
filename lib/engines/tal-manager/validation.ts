/**
 * Validation for the TAL Manager engine (#05).
 *
 *  - One cheap structural validator per CONSUMED event payload, run before any
 *    processing (conventions.md). These are guards, not business rules.
 *  - `completionCheck` encodes the doc's verbatim "Task completion check" list.
 *    The engine publishes `tal.finalized` ONLY when this returns { ok: true }
 *    (verify-before-publish, ADR-003).
 */

import type { AccountsScoredPayload } from '../../events';

/**
 * Structural validation for the `accounts.scored` payload (the trigger event).
 * Confirms the fields the engine relies on are present and well-typed.
 * Throws on the first problem so the worker can fail-fast and retry/dead-letter.
 */
export function validateAccountsScoredPayload(payload: AccountsScoredPayload): void {
  if (typeof payload !== 'object' || payload === null) {
    throw new Error('[tal-manager] accounts.scored: payload is not an object');
  }
  if (!Array.isArray(payload.account_ids)) {
    throw new Error('[tal-manager] accounts.scored: account_ids must be an array');
  }
  if (typeof payload.formula_version !== 'number') {
    throw new Error('[tal-manager] accounts.scored: formula_version must be a number');
  }
  if (
    typeof payload.tier_1_count !== 'number' ||
    typeof payload.tier_2_count !== 'number' ||
    typeof payload.tier_3_count !== 'number'
  ) {
    throw new Error('[tal-manager] accounts.scored: tier_*_count must be numbers');
  }
  if (typeof payload.scored_at !== 'string') {
    throw new Error('[tal-manager] accounts.scored: scored_at must be an ISO timestamp string');
  }
}

/**
 * Inputs the completion check needs from the job run. The owner wires real
 * values from the service layer (TAL version row, suppression result, CRM
 * write-back confirmation from Engine 10, and the published-event ack).
 */
export interface CompletionCheckInput {
  /** Suppression rules applied and suppressed accounts retained in suppression_list. */
  suppressionApplied: boolean;
  /** A new immutable TAL version row was created. */
  talVersionCreated: boolean;
  /** CRM company properties + active lists written, confirmed via Engine 10. */
  crmPropertiesAndListsWritten: boolean;
  /** `tal.finalized` was published and confirmed. */
  finalizedEventPublished: boolean;
}

/**
 * Verbatim "Task completion check" from engine-05-tal-manager.md.
 * Returns { ok, failed } — `failed` lists the human-readable checks that did
 * not pass. The engine publishes its success event only when `ok` is true;
 * otherwise it must publish an error event (there is no dedicated error event
 * in the catalog for this engine — see README "Failure handling").
 */
export function completionCheck(input: CompletionCheckInput): { ok: boolean; failed: string[] } {
  const failed: string[] = [];

  if (!input.suppressionApplied) {
    failed.push(
      'Suppression rules applied — suppressed accounts removed from active TAL but retained in suppression_list',
    );
  }
  if (!input.talVersionCreated) {
    failed.push('A new immutable TAL version created');
  }
  if (!input.crmPropertiesAndListsWritten) {
    failed.push('CRM company properties + active lists written (confirmed via Engine 10)');
  }
  if (!input.finalizedEventPublished) {
    failed.push('`tal.finalized` event published and confirmed');
  }

  return { ok: failed.length === 0, failed };
}
