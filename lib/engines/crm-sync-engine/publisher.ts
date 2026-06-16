/**
 * Publishers for the CRM Sync Engine (engine 10).
 *
 * One thin, strongly-typed wrapper per PUBLISHED event. Each simply forwards to
 * the foundation `publishEvent`. Handlers/services must call these ONLY after the
 * task-completion check passes (verify-before-publish, ADR-003).
 *
 * Published events:
 *   - crm.synced            (batch write outcome with counts + errors)
 *   - crm.deal_closed_won   (critical feedback loop → ICP Engine + GTM Flywheel)
 *   - crm.deal_closed_lost  (critical feedback loop → ICP Engine + GTM Flywheel)
 */

import { publishEvent } from '../../events';
import type {
  CrmSyncedPayload,
  CrmDealClosedWonPayload,
  CrmDealClosedLostPayload,
} from '../../events';

export interface PublishCtx {
  workspaceId: string;
  correlationId?: string;
}

/** Emit `crm.synced` after a batch write completes (success or partial). */
export async function publishCrmSynced(
  payload: CrmSyncedPayload,
  ctx: PublishCtx,
): Promise<void> {
  await publishEvent('crm.synced', payload, ctx);
}

/** Emit `crm.deal_closed_won` parsed from an inbound CRM deal-stage webhook. */
export async function publishCrmDealClosedWon(
  payload: CrmDealClosedWonPayload,
  ctx: PublishCtx,
): Promise<void> {
  await publishEvent('crm.deal_closed_won', payload, ctx);
}

/** Emit `crm.deal_closed_lost` parsed from an inbound CRM deal-stage webhook. */
export async function publishCrmDealClosedLost(
  payload: CrmDealClosedLostPayload,
  ctx: PublishCtx,
): Promise<void> {
  await publishEvent('crm.deal_closed_lost', payload, ctx);
}
