/**
 * Payload validation + task-completion check for the Awareness Engine (engine 08).
 *
 * Validation is intentionally CHEAP and STRUCTURAL — it guards the handler against
 * malformed payloads before any scoring work. Deeper business validation lives in
 * the service layer. (conventions.md: validate incoming event payloads before
 * processing.)
 */

import type { SignalReceivedPayload } from '../../events';

export interface ValidationResult {
  ok: boolean;
  failed: string[];
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-consumed-event payload validators
// ─────────────────────────────────────────────────────────────────────────────

/** `signal.received` — Signal Engine emitted a scored signal for an account. */
export function validateSignalReceived(payload: SignalReceivedPayload): ValidationResult {
  const failed: string[] = [];
  if (!isNonEmptyString(payload?.account_id)) failed.push('account_id must be a non-empty string');
  if (!isNonEmptyString(payload?.signal_type)) failed.push('signal_type must be a non-empty string');
  if (typeof payload?.points_awarded !== 'number') failed.push('points_awarded must be a number');
  if (typeof payload?.decay_rate_per_week !== 'number') {
    failed.push('decay_rate_per_week must be a number');
  }
  if (!isNonEmptyString(payload?.occurred_at)) failed.push('occurred_at must be an ISO timestamp');
  return { ok: failed.length === 0, failed };
}

// ─────────────────────────────────────────────────────────────────────────────
// Task completion check (verbatim from the engine doc) — verify before publish.
// ADR-003: publish the success event(s) ONLY when ALL of these pass; otherwise
// the engine must publish its error event instead of a success event. A
// half-finished job that reports success is worse than a failed job that reports
// failure.
// ─────────────────────────────────────────────────────────────────────────────

/** The facts a score recompute must establish before publishing success events. */
export interface CompletionFacts {
  /** Score updated and capped at 100 with decay applied to all prior signals. */
  scoreUpdatedCappedAndDecayed: boolean;
  /** Stage correctly assigned from the score. */
  stageAssignedFromScore: boolean;
  /** `account.stage_changed` published if a boundary was crossed. */
  stageChangedPublishedIfBoundaryCrossed: boolean;
  /** Routing rules evaluated and matched rules forwarded to the Orchestrator. */
  routingRulesEvaluatedAndForwarded: boolean;
}

/**
 * Encodes the doc's verbatim "Task completion check" list. The engine marks its
 * work complete only when ALL of these are true.
 */
export function completionCheck(facts: CompletionFacts): { ok: boolean; failed: string[] } {
  const failed: string[] = [];
  if (!facts.scoreUpdatedCappedAndDecayed) {
    failed.push('Score updated and capped at 100 with decay applied to all prior signals');
  }
  if (!facts.stageAssignedFromScore) {
    failed.push('Stage correctly assigned from the score');
  }
  if (!facts.stageChangedPublishedIfBoundaryCrossed) {
    failed.push('account.stage_changed published if a boundary was crossed');
  }
  if (!facts.routingRulesEvaluatedAndForwarded) {
    failed.push('Routing rules evaluated and matched rules forwarded to the Orchestrator');
  }
  return { ok: failed.length === 0, failed };
}
