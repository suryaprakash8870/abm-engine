/**
 * Event handlers for the Demand Gen Orchestrator (Engine 09).
 *
 * One handler per CONSUMED event. Each handler:
 *   1. validates the incoming payload (validation.ts),
 *   2. runs the core orchestration (service.ts) — TODO(owner),
 *   3. publishes the success event only after the task-completion check passes
 *      (verify-before-publish, ADR-003), via publisher.ts.
 *
 * Consumed events (catalog): account.stage_changed, account.hot.
 */

import type { EventEnvelope } from '../../events';
import {
  validateAccountStageChanged,
  validateAccountHot,
} from './validation';
import {
  triggerFromStageChanged,
  triggerFromAccountHot,
} from './service';

/**
 * Handle `account.stage_changed` (primary trigger, from Awareness Engine 08).
 * Decides and fires the play matched to the account's new stage × tier.
 */
export async function handleAccountStageChanged(
  event: EventEnvelope<'account.stage_changed'>,
): Promise<void> {
  const check = validateAccountStageChanged(event.payload);
  if (!check.ok) {
    throw new Error(
      `[demand-gen-orchestrator] invalid account.stage_changed payload: ${check.failed.join(', ')}`,
    );
  }

  const _trigger = triggerFromStageChanged(
    event.workspace_id,
    event.payload,
    event.correlation_id,
  );

  // TODO(owner): core logic — runOrchestration(trigger), then completionCheck(...),
  //   then publishPlayFired(payload, { workspaceId, correlationId }) on success,
  //   else surface/log an error (no half-done success).
}

/**
 * Handle `account.hot` (urgent trigger, from Awareness Engine 08).
 * Fires the high-urgency play for a suddenly-hot account.
 */
export async function handleAccountHot(
  event: EventEnvelope<'account.hot'>,
): Promise<void> {
  const check = validateAccountHot(event.payload);
  if (!check.ok) {
    throw new Error(
      `[demand-gen-orchestrator] invalid account.hot payload: ${check.failed.join(', ')}`,
    );
  }

  const _trigger = triggerFromAccountHot(
    event.workspace_id,
    event.payload,
    event.correlation_id,
  );

  // TODO(owner): core logic — runOrchestration(trigger), then completionCheck(...),
  //   then publishPlayFired(payload, { workspaceId, correlationId }) on success,
  //   else surface/log an error (no half-done success).
}
