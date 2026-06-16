/**
 * Publishers for the Demand Gen Orchestrator (Engine 09).
 *
 * One thin, strongly-typed function per PUBLISHED event. Each delegates to the
 * shared `publishEvent`, which is the ONLY way an engine emits an event. Per
 * ADR-003 (verify-before-publish), a publisher is called only AFTER the relevant
 * task-completion check passes.
 *
 * Published events:
 *   - play.fired             → consumed by crm-sync-engine, gtm-flywheel
 *   - play.outcome_recorded  → consumed by gtm-flywheel, icp-engine
 */

import {
  publishEvent,
  type PlayFiredPayload,
  type PlayOutcomeRecordedPayload,
} from '../../events';

/** Context every publish needs: the tenant and (optionally) the pipeline correlation id. */
export interface PublishCtx {
  workspaceId: string;
  correlationId?: string;
}

/** Emit `play.fired` after the task-completion check passes. */
export async function publishPlayFired(
  payload: PlayFiredPayload,
  ctx: PublishCtx,
): Promise<void> {
  await publishEvent('play.fired', payload, ctx);
}

/** Emit `play.outcome_recorded` when a rep/system records the result of a play. */
export async function publishPlayOutcomeRecorded(
  payload: PlayOutcomeRecordedPayload,
  ctx: PublishCtx,
): Promise<void> {
  await publishEvent('play.outcome_recorded', payload, ctx);
}
