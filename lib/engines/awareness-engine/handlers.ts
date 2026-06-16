/**
 * Event handlers for the Awareness Engine (engine 08).
 *
 * One handler per CONSUMED event. The handler:
 *   1. validates the payload (validation.ts),
 *   2. // TODO(owner): runs the core scoring + routing logic (service.ts),
 *   3. publishes its output events ONLY after the task-completion check passes
 *      (verify-before-publish, ADR-003).
 *
 * Consumed events (catalog): signal.received.
 * Published events (catalog): account.score_updated, account.stage_changed,
 * account.hot.
 *
 * Output mapping for `signal.received`:
 *   - ALWAYS → account.score_updated (the recomputed, decayed, capped score)
 *   - IF a stage boundary was crossed → account.stage_changed
 *   - IF the score jumped > 20 points within 48h → account.hot
 */

import type { EventEnvelope } from '../../events';
import { validateSignalReceived } from './validation';
import {
  publishAccountScoreUpdated,
  publishAccountStageChanged,
  publishAccountHot,
} from './publisher';

/**
 * `signal.received` → recompute the account's decayed, capped awareness score,
 * re-stage it, detect hot jumps, and evaluate routing rules.
 */
export async function handleSignalReceived(
  event: EventEnvelope<'signal.received'>,
): Promise<void> {
  const { ok, failed } = validateSignalReceived(event.payload);
  if (!ok) {
    throw new Error(`[awareness-engine] invalid signal.received payload: ${failed.join('; ')}`);
  }

  const ctx = { workspaceId: event.workspace_id, correlationId: event.correlation_id };

  // TODO(owner): core logic (see service.ts) —
  //   1. load current awareness_scores row for event.payload.account_id
  //   2. add points + recompute time-decayed contribution of prior signals, cap at 100
  //   3. apply per-signal decay (event.payload.decay_rate_per_week)
  //   4. derive the new stage; if it crossed a boundary, publish account.stage_changed
  //   5. if score jumped > 20 within 48h, publish account.hot
  //   6. evaluate workspace routing rules; forward matches to the Orchestrator
  //   7. persist awareness_scores + a score_snapshots row
  // Only publish AFTER completionCheck() passes (ADR-003). On failure, log the full
  // signal history, keep the last known good score, and alert (failure handling).
  const now = new Date().toISOString();

  // ALWAYS emitted: the recomputed score.
  await publishAccountScoreUpdated(
    {
      account_id: event.payload.account_id,
      current_score: 0, // TODO(owner): decayed + capped score
      previous_score: 0, // TODO(owner): last known good score
      stage: 'identified', // TODO(owner): stage derived from current_score
      score_7d_change: 0, // TODO(owner)
      score_30d_change: 0, // TODO(owner)
      last_signal_at: event.payload.occurred_at,
      last_calculated_at: now,
    },
    ctx,
  );

  // CONDITIONAL: only when the new score crosses a stage boundary.
  // TODO(owner): guard with `if (crossedStageBoundary) { ... }`.
  void publishAccountStageChanged;

  // CONDITIONAL: only when the score jumped > 20 points within 48 hours.
  // TODO(owner): guard with `if (jumpedHot) { ... }`.
  void publishAccountHot;
}
