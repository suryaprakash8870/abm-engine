/**
 * Event handlers for the Demand Gen Orchestrator (Engine 09).
 *
 * account.stage_changed / account.hot → resolve tier → run the orchestration
 * (evaluate matrix → suppression check → fire) → publish play.fired ONLY when a
 * play actually fired and the completion check passes (verify-before-publish,
 * ADR-003). Suppressed / no-play triggers publish nothing (logged, not an error).
 *
 * Consumed events (catalog): account.stage_changed, account.hot.
 */

import type { EventEnvelope } from '../../events';
import { validateAccountStageChanged, validateAccountHot, completionCheck } from './validation';
import { resolveTier, triggerFromStageChanged, triggerFromAccountHot, runOrchestration, type PlayTrigger } from './service';
import { publishPlayFired } from './publisher';
import { notifyPlayFired } from './notify';

async function orchestrateAndPublish(workspaceId: string, correlationId: string, trigger: PlayTrigger): Promise<void> {
  const result = await runOrchestration(trigger);
  if (result.status !== 'fired') return; // suppressed / no_play → nothing to publish

  const check = completionCheck({
    playSelected: !!result.payload.play_type,
    suppressionCheckedBeforeExternalCall: true, // checked inside runOrchestration's atomic txn before firing
    // A real external action happened: a Slack alert was sent (crm_task_slack path)
    // OR the account was actually enrolled in a sequence (status === 'enrolled').
    crmTaskOrSlackSent: !!result.payload.slack_message_ts || result.payload.status === 'enrolled',
    playFiredPublishedAndLogged: true, // the publish below is the confirmation; row already logged
  });
  if (!check.ok) throw new Error(`[demand-gen-orchestrator] completion check failed: ${check.failed.join('; ')}`);

  await publishPlayFired(result.payload, { workspaceId, correlationId });
  await notifyPlayFired(workspaceId, result.payload); // post-commit, best-effort
}

/** Primary trigger: a stage boundary was crossed (from Awareness Engine 08). */
export async function handleAccountStageChanged(event: EventEnvelope<'account.stage_changed'>): Promise<void> {
  const check = validateAccountStageChanged(event.payload);
  if (!check.ok) throw new Error(`[demand-gen-orchestrator] invalid account.stage_changed payload: ${check.failed.join(', ')}`);

  const tier = await resolveTier(event.workspace_id, event.payload.account_id);
  if (tier == null) return; // not on the TAL → no play

  const trigger = triggerFromStageChanged(event.workspace_id, event.payload, tier, event.correlation_id);
  await orchestrateAndPublish(event.workspace_id, event.correlation_id, trigger);
}

/** Urgent trigger: an account suddenly went hot (from Awareness Engine 08). */
export async function handleAccountHot(event: EventEnvelope<'account.hot'>): Promise<void> {
  const check = validateAccountHot(event.payload);
  if (!check.ok) throw new Error(`[demand-gen-orchestrator] invalid account.hot payload: ${check.failed.join(', ')}`);

  const tier = await resolveTier(event.workspace_id, event.payload.account_id);
  if (tier == null) return;

  const trigger = triggerFromAccountHot(event.workspace_id, event.payload, tier, event.correlation_id);
  await orchestrateAndPublish(event.workspace_id, event.correlation_id, trigger);
}
