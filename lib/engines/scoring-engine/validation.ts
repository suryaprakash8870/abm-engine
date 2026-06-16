/**
 * Validation — cheap, structural guards run BEFORE any processing.
 *
 * Two responsibilities:
 *  1. A payload validator per CONSUMED event (`accounts.enriched`). These reject
 *     malformed events early (conventions.md: validate incoming payloads before
 *     processing).
 *  2. `completionCheck` — the verbatim "Task completion check" list from the doc,
 *     returning `{ ok, failed }`. The handler must call it and publish
 *     `accounts.scored` ONLY when `ok === true` (verify-before-publish, ADR-003);
 *     otherwise it publishes `scoring.failed`.
 *
 * @see ../../../docs/engines/engine-04-scoring-engine.md
 */

import type { EventEnvelope, AccountsEnrichedPayload } from '../../events';

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

/** Structural check for an `accounts.enriched` envelope (the scoring trigger). */
export function validateAccountsEnriched(
  event: EventEnvelope<'accounts.enriched'>,
): ValidationResult {
  const errors: string[] = [];
  const p = event.payload as AccountsEnrichedPayload | undefined;
  if (!p) {
    errors.push('payload is missing');
    return { ok: false, errors };
  }
  if (typeof p.job_id !== 'string' || p.job_id.length === 0) {
    errors.push('job_id must be a non-empty string');
  }
  if (!Array.isArray(p.enriched_account_ids)) {
    errors.push('enriched_account_ids must be an array');
  }
  if (typeof p.qualified_count !== 'number') {
    errors.push('qualified_count must be a number');
  }
  if (typeof p.enriched !== 'number') {
    errors.push('enriched must be a number');
  }
  return { ok: errors.length === 0, errors };
}

/**
 * Result of the task-completion gate.
 * `failed` lists the verbatim checks that did not pass.
 */
export interface CompletionCheckResult {
  ok: boolean;
  failed: string[];
}

/**
 * Inputs the completion check inspects. The owner fills these from the job state
 * (account_scores / scoring_formulas / tier_overrides).
 */
export interface CompletionCheckInput {
  /** Every qualified account has a score between 0-100 and an assigned tier. */
  everyAccountHasScoreAndTier: boolean;
  /** A score breakdown is stored for every account. */
  scoreBreakdownStoredForEveryAccount: boolean;
  /** Tier boundaries are recorded (default or user-adjusted). */
  tierBoundariesRecorded: boolean;
  /** `accounts.scored` event published and confirmed. */
  accountsScoredPublishedAndConfirmed: boolean;
}

/**
 * Encodes the doc's verbatim "Task completion check" list.
 *
 * The engine marks its work complete only when ALL are true. If any check
 * fails, the engine publishes `scoring.failed` instead of `accounts.scored`.
 * A half-finished job that reports success is worse than a failed job that
 * reports failure.
 */
export function completionCheck(input: CompletionCheckInput): CompletionCheckResult {
  const failed: string[] = [];
  if (!input.everyAccountHasScoreAndTier) {
    failed.push('Every qualified account has a score between 0-100 and an assigned tier');
  }
  if (!input.scoreBreakdownStoredForEveryAccount) {
    failed.push('A score breakdown is stored for every account');
  }
  if (!input.tierBoundariesRecorded) {
    failed.push('Tier boundaries are recorded (default or user-adjusted)');
  }
  if (!input.accountsScoredPublishedAndConfirmed) {
    failed.push('`accounts.scored` event published and confirmed');
  }
  return { ok: failed.length === 0, failed };
}
