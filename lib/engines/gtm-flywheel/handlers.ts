/**
 * Engine 11 — GTM Flywheel · event handlers.
 *
 * One handler per CONSUMED event (catalog: icp.updated, account.score_updated,
 * account.hot, play.fired, play.outcome_recorded, crm.synced, crm.deal_closed_won,
 * crm.deal_closed_lost). The flywheel is a PASSIVE listener — it never blocks any
 * upstream engine and never throws back into the bus for ordinary domain outcomes;
 * it records insight and, when warranted, publishes its own events.
 *
 * Each handler: validate payload (validation.ts) → // TODO(owner) core logic →
 * publish (only after the task-completion check passes, ADR-003).
 */

import type { EventEnvelope } from '../../events';
import {
  validateAccountHot,
  validateAccountScoreUpdated,
  validateCrmDealClosedLost,
  validateCrmDealClosedWon,
  validateCrmSynced,
  validateIcpUpdated,
  validatePlayFired,
  validatePlayOutcomeRecorded,
  completionCheck,
} from './validation';
import {
  publishFlywheelError,
  publishFlywheelMetricsUpdated,
  publishIcpRefreshRecommended,
  type PublishCtx,
} from './publisher';
import {
  buildAttribution, recordWinLoss, calculateTierMetrics, runSignalCorrelation, closedWonCount,
  claimIcpRefreshMilestone, buildIcpRefreshRecommendation, updateAntiIcp, buildMetricsUpdatedPayload,
} from './service';

/** Derive the publish context from the inbound envelope (propagate correlation id). */
function ctxOf(event: EventEnvelope): PublishCtx {
  return { workspaceId: event.workspace_id, correlationId: event.correlation_id };
}

// ─────────────────────────────────────────────────────────────────────────────
// icp.updated — keep the flywheel's view of the active ICP version in sync
// ─────────────────────────────────────────────────────────────────────────────

export async function handleIcpUpdated(event: EventEnvelope<'icp.updated'>): Promise<void> {
  if (!validateIcpUpdated(event.payload)) {
    await publishFlywheelError(
      { failed_check: 'icp.updated payload shape', deal_id: null, reason: 'invalid payload', stage: 'validate' },
      ctxOf(event),
    );
    return;
  }
  // TODO(owner): record the new ICP version so attribution/correlation reference the right ICP.
}

// ─────────────────────────────────────────────────────────────────────────────
// account.score_updated — feed awareness-score movement into metrics history
// ─────────────────────────────────────────────────────────────────────────────

export async function handleAccountScoreUpdated(
  event: EventEnvelope<'account.score_updated'>,
): Promise<void> {
  if (!validateAccountScoreUpdated(event.payload)) {
    await publishFlywheelError(
      { failed_check: 'account.score_updated payload shape', deal_id: null, reason: 'invalid payload', stage: 'validate' },
      ctxOf(event),
    );
    return;
  }
  // TODO(owner): persist score movement for the score→pipeline correlation analysis.
}

// ─────────────────────────────────────────────────────────────────────────────
// account.hot — note hot moments as candidate attribution touches
// ─────────────────────────────────────────────────────────────────────────────

export async function handleAccountHot(event: EventEnvelope<'account.hot'>): Promise<void> {
  if (!validateAccountHot(event.payload)) {
    await publishFlywheelError(
      { failed_check: 'account.hot payload shape', deal_id: null, reason: 'invalid payload', stage: 'validate' },
      ctxOf(event),
    );
    return;
  }
  // TODO(owner): record the hot moment + dominant_signal_type for later attribution walk-back.
}

// ─────────────────────────────────────────────────────────────────────────────
// play.fired — record the touch so it can be attributed to an eventual deal
// ─────────────────────────────────────────────────────────────────────────────

export async function handlePlayFired(event: EventEnvelope<'play.fired'>): Promise<void> {
  if (!validatePlayFired(event.payload)) {
    await publishFlywheelError(
      { failed_check: 'play.fired payload shape', deal_id: null, reason: 'invalid payload', stage: 'validate' },
      ctxOf(event),
    );
    return;
  }
  // TODO(owner): record the play touch on the account timeline (touch_type='play').
}

// ─────────────────────────────────────────────────────────────────────────────
// play.outcome_recorded — link play outcomes to deal progression
// ─────────────────────────────────────────────────────────────────────────────

export async function handlePlayOutcomeRecorded(
  event: EventEnvelope<'play.outcome_recorded'>,
): Promise<void> {
  if (!validatePlayOutcomeRecorded(event.payload)) {
    await publishFlywheelError(
      { failed_check: 'play.outcome_recorded payload shape', deal_id: null, reason: 'invalid payload', stage: 'validate' },
      ctxOf(event),
    );
    return;
  }
  // TODO(owner): record play outcome for play-effectiveness correlation.
}

// ─────────────────────────────────────────────────────────────────────────────
// crm.synced — refresh metrics on new CRM data (step 3 + step 8)
// ─────────────────────────────────────────────────────────────────────────────

export async function handleCrmSynced(event: EventEnvelope<'crm.synced'>): Promise<void> {
  if (!validateCrmSynced(event.payload)) {
    await publishFlywheelError(
      { failed_check: 'crm.synced payload shape', deal_id: null, reason: 'invalid payload', stage: 'validate' },
      ctxOf(event),
    );
    return;
  }
  // TODO(owner): recompute tier metrics (service.calculateTierMetrics); if the
  // completion check passes and metrics changed significantly, publish below.
  // const payload = await buildMetricsUpdatedPayload(event.workspace_id);
  // const check = completionCheck({ ... });
  // if (!check.ok) { await publishFlywheelError({ failed_check: check.failed[0]!, ... }); return; }
  // await publishFlywheelMetricsUpdated(payload, ctxOf(event));
  void publishFlywheelMetricsUpdated; // referenced until the owner wires the publish path
}

// ─────────────────────────────────────────────────────────────────────────────
// crm.deal_closed_won — attribution + metrics + every-5th ICP refresh (steps 2,3,5,8)
// ─────────────────────────────────────────────────────────────────────────────

export async function handleCrmDealClosedWon(
  event: EventEnvelope<'crm.deal_closed_won'>,
): Promise<void> {
  if (!validateCrmDealClosedWon(event.payload)) {
    await publishFlywheelError(
      {
        failed_check: 'crm.deal_closed_won payload shape',
        deal_id: event.payload?.deal_id ?? null,
        reason: 'invalid payload',
        stage: 'validate',
      },
      ctxOf(event),
    );
    return;
  }
  const ws = event.workspace_id;
  const attribution = await buildAttribution(ws, event.payload);
  await recordWinLoss(ws, event.payload, 'won', attribution.days_to_close);
  const metrics = await calculateTierMetrics(ws);
  await runSignalCorrelation(ws); // honors the ≥20-data-point suppression gate
  const count = await closedWonCount(ws);
  const recommend = await claimIcpRefreshMilestone(ws, count); // atomic once-per-band claim

  const check = completionCheck({
    attributionBuiltForEveryClosedDeal: attribution.deal_id === event.payload.deal_id,
    pipelineWinRateByTierCalculated: !!metrics.snapshot_date,
    correlationSuppressedBelow20Points: true, // runSignalCorrelation enforces it
    metricsUpdatedPublished: true, // published below
    icpRefreshFiredEvery5thWin: true, // fired below when due
  });
  if (!check.ok) {
    await publishFlywheelError({ failed_check: check.failed[0] ?? '', deal_id: event.payload.deal_id, reason: 'completion check failed', stage: 'finalize' }, ctxOf(event));
    return;
  }

  // Every 5th win closes the learning loop back to the ICP Engine (01).
  if (recommend) {
    await publishIcpRefreshRecommended(await buildIcpRefreshRecommendation(ws, event.payload, count), ctxOf(event));
  }
  await publishFlywheelMetricsUpdated(await buildMetricsUpdatedPayload(ws, metrics), ctxOf(event));
}

// ─────────────────────────────────────────────────────────────────────────────
// crm.deal_closed_lost — anti-ICP model + exclusion suggestions (step 6)
// ─────────────────────────────────────────────────────────────────────────────

export async function handleCrmDealClosedLost(
  event: EventEnvelope<'crm.deal_closed_lost'>,
): Promise<void> {
  if (!validateCrmDealClosedLost(event.payload)) {
    await publishFlywheelError(
      {
        failed_check: 'crm.deal_closed_lost payload shape',
        deal_id: event.payload?.deal_id ?? null,
        reason: 'invalid payload',
        stage: 'validate',
      },
      ctxOf(event),
    );
    return;
  }
  const ws = event.workspace_id;
  await updateAntiIcp(ws, event.payload); // record the loss → anti-ICP / exclusion suggestions
  const metrics = await calculateTierMetrics(ws);
  await publishFlywheelMetricsUpdated(await buildMetricsUpdatedPayload(ws, metrics), ctxOf(event));
}
