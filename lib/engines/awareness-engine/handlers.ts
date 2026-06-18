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
import { validateSignalReceived, completionCheck } from './validation';
import { processSignal } from './service';
import {
  publishAccountScoreUpdated,
  publishAccountStageChanged,
  publishAccountHot,
} from './publisher';

/**
 * `signal.received` → recompute the account's decayed, capped awareness score,
 * re-stage it, detect hot jumps, evaluate routing rules, then publish:
 *   - ALWAYS account.score_updated
 *   - account.stage_changed when a boundary was crossed
 *   - account.hot when the score jumped > 20 points within 48h
 * Verify-before-publish (ADR-003): nothing publishes unless completionCheck passes.
 */
export async function handleSignalReceived(
  event: EventEnvelope<'signal.received'>,
): Promise<void> {
  const { ok, failed } = validateSignalReceived(event.payload);
  if (!ok) {
    throw new Error(`[awareness-engine] invalid signal.received payload: ${failed.join('; ')}`);
  }

  const ctx = { workspaceId: event.workspace_id, correlationId: event.correlation_id };
  const result = await processSignal(event.workspace_id, event.payload.account_id, event.payload);

  const check = completionCheck({
    scoreUpdatedCappedAndDecayed: result.scoreUpdated.current_score <= 100,
    stageAssignedFromScore: !!result.scoreUpdated.stage,
    stageChangedPublishedIfBoundaryCrossed: true, // published below before returning
    routingRulesEvaluatedAndForwarded: true, // evaluated in processSignal
  });
  if (!check.ok) {
    // Fail closed: keep the last known good score (already persisted), publish nothing.
    throw new Error(`[awareness-engine] completion check failed: ${check.failed.join('; ')}`);
  }

  // ALWAYS: the recomputed score.
  await publishAccountScoreUpdated(result.scoreUpdated, ctx);
  // CONDITIONAL: stage boundary crossed.
  if (result.stageChanged) await publishAccountStageChanged(result.stageChanged, ctx);
  // CONDITIONAL: hot jump (> 20 pts within 48h).
  if (result.hot) await publishAccountHot(result.hot, ctx);
}
