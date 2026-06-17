/**
 * Handlers — one async handler per CONSUMED event (engine 04).
 *
 * accounts.enriched → validate → enqueue scoring job (never inline).
 * icp.created / icp.updated → invalidate cached formula so next run regenerates.
 */

import type { EventEnvelope } from '../../events';
import { validateAccountsEnriched } from './validation';
import { enqueueScoringJob } from './scoring-queue';
import { prisma } from '../../db/client';
import type { IcpCreatedPayload } from '../../events';

export async function handleAccountsEnriched(
  event: EventEnvelope<'accounts.enriched'>,
): Promise<void> {
  const validation = validateAccountsEnriched(event);
  if (!validation.ok) {
    throw new Error(`[scoring-engine] invalid accounts.enriched payload: ${validation.errors.join('; ')}`);
  }

  const p = event.payload;

  // Only score qualified accounts (disqualified ones don't enter the TAL).
  const accountIds = p.enriched_account_ids;
  if (accountIds.length === 0) return;

  // Resolve the ICP id for this workspace (most recent).
  const icp = await prisma.icpDefinition.findFirst({
    where: { workspaceId: event.workspace_id },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  });
  if (!icp) {
    throw new Error('[scoring-engine] no ICP found for workspace — cannot score accounts');
  }

  await enqueueScoringJob({
    workspaceId: event.workspace_id,
    icpId: icp.id,
    accountIds,
    sourceJobId: p.job_id,
    correlationId: event.correlation_id,
  });
}

/** When ICP changes, delete the existing formula so the next run regenerates it. */
export async function handleIcpCreatedOrUpdated(
  event: EventEnvelope<'icp.created'> | EventEnvelope<'icp.updated'>,
): Promise<void> {
  const p = event.payload as IcpCreatedPayload;
  await prisma.scoringFormula.deleteMany({
    where: { workspaceId: event.workspace_id, icpId: p.icp_id },
  });
}
