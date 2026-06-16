/**
 * Publishers for the Awareness Engine (engine 08).
 *
 * One thin, strongly-typed wrapper per PUBLISHED event. Each simply forwards to
 * the foundation `publishEvent`. Handlers/services must call these ONLY after the
 * task-completion check passes (verify-before-publish, ADR-003).
 *
 * Published events:
 *   - account.score_updated  (the recomputed, decayed, capped score → CRM Sync + GTM Flywheel)
 *   - account.stage_changed  (a stage boundary was crossed → Demand-Gen Orchestrator)
 *   - account.hot            (score jumped > 20 pts within 48h → Orchestrator + GTM Flywheel)
 */

import { publishEvent } from '../../events';
import type {
  AccountScoreUpdatedPayload,
  AccountStageChangedPayload,
  AccountHotPayload,
} from '../../events';

export interface PublishCtx {
  workspaceId: string;
  correlationId?: string;
}

/** Emit `account.score_updated` after every recompute (score capped at 100). */
export async function publishAccountScoreUpdated(
  payload: AccountScoreUpdatedPayload,
  ctx: PublishCtx,
): Promise<void> {
  await publishEvent('account.score_updated', payload, ctx);
}

/** Emit `account.stage_changed` only when a stage boundary was crossed. */
export async function publishAccountStageChanged(
  payload: AccountStageChangedPayload,
  ctx: PublishCtx,
): Promise<void> {
  await publishEvent('account.stage_changed', payload, ctx);
}

/** Emit `account.hot` only when the score jumped > 20 points within 48 hours. */
export async function publishAccountHot(
  payload: AccountHotPayload,
  ctx: PublishCtx,
): Promise<void> {
  await publishEvent('account.hot', payload, ctx);
}
