/**
 * Engine 11 — GTM Flywheel · core service.
 *
 * Implements the doc's "Step-by-step job". Each function below is a compiling stub
 * with a typed return (or an explicit `not implemented` throw); the owner fills the
 * bodies. Prisma models for this engine do NOT exist yet, so they are referenced
 * only inside // TODO(owner) comments — never in a type-checked position.
 *
 * Tables this engine owns (prisma/schema/gtm-flywheel.prisma):
 *   pipeline_snapshots, attribution_events, win_loss_analysis,
 *   flywheel_metrics, signal_correlation_data.
 *
 * Step-by-step job (from engine-11-gtm-flywheel.md):
 *   1. Passively consume events from all engines (never blocks any engine)
 *   2. On crm.deal_closed_won: walk back the account's signal history → attribution
 *   3. Continuously calculate pipeline, win rate, avg deal size, days-to-close — by tier
 *   4. After 20+ closed deals: run signal correlation analysis
 *   5. After every 5th new Closed Won: publish icp.refresh_recommended
 *   6. On crm.deal_closed_lost: update the anti-ICP model + surface exclusion suggestions
 *   7. Generate and send a weekly metrics digest email every Monday
 *   8. Publish flywheel.metrics_updated daily or on significant change
 */

import type {
  CrmDealClosedLostPayload,
  CrmDealClosedWonPayload,
  FlywheelMetricsUpdatedPayload,
  IcpRefreshRecommendedPayload,
  Json,
} from '../../events';

// ─────────────────────────────────────────────────────────────────────────────
// Step 2 — attribution: walk back the account's signal history
// ─────────────────────────────────────────────────────────────────────────────

export interface AttributionResult {
  deal_id: string;
  account_id: string | null;
  /** First-touch, last-touch, and linear models — never one "true" number (failure handling). */
  first_touch: Json;
  last_touch: Json;
  linear: Json;
  touch_count: number;
}

/**
 * On crm.deal_closed_won: walk the account's signal/play timeline back to first
 * touch and build multi-touch attribution.
 *
 * TODO(owner): read signal/play history for payload.account_id (scoped by
 * workspaceId), order by occurred_at, and write rows to `attribution_events`.
 * Return first/last/linear models for the dashboard.
 */
export async function buildAttribution(
  _workspaceId: string,
  _payload: CrmDealClosedWonPayload,
): Promise<AttributionResult> {
  // TODO(owner): implement attribution walk-back + persist to attribution_events.
  throw new Error('not implemented');
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 3 — pipeline / win-rate / deal-size / days-to-close, by tier
// ─────────────────────────────────────────────────────────────────────────────

export interface TierMetrics {
  pipeline_by_tier: Json;
  win_rate_by_tier: Json;
  avg_deal_size_by_tier: Json;
  days_to_close_by_tier: Json;
  /** YYYY-MM-DD. */
  snapshot_date: string;
}

/**
 * Continuously recompute the core funnel metrics broken down by tier.
 *
 * TODO(owner): aggregate from CRM-synced deal data + local copies; persist a row
 * to `pipeline_snapshots` and upsert `flywheel_metrics` keyed rows.
 */
export async function calculateTierMetrics(_workspaceId: string): Promise<TierMetrics> {
  // TODO(owner): implement tier metric aggregation.
  throw new Error('not implemented');
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 4 — signal correlation analysis (suppressed below 20 data points)
// ─────────────────────────────────────────────────────────────────────────────

export interface CorrelationResult {
  /** True only when sample_size >= 20 (no misleading statistics). */
  hasEnoughData: boolean;
  sample_size: number;
  /** Each entry: a signal_combination + its correlation_score. */
  combinations: Array<{ signal_combination: string[]; correlation_score: number }>;
}

/**
 * After 20+ closed deals, run correlation between signal combinations and
 * pipeline/win outcomes. Below 20 data points → hasEnoughData=false ("more data
 * needed"), never misleading stats.
 *
 * TODO(owner): count closed deals; if < 20 return { hasEnoughData: false }.
 * Otherwise compute correlations and persist to `signal_correlation_data`.
 */
export async function runSignalCorrelation(_workspaceId: string): Promise<CorrelationResult> {
  // TODO(owner): implement correlation analysis with the 20-point suppression gate.
  throw new Error('not implemented');
}

/** The doc's hard threshold — correlation below this is suppressed. */
export const MIN_CORRELATION_DATA_POINTS = 20;

// ─────────────────────────────────────────────────────────────────────────────
// Step 5 — every 5th Closed Won → recommend an ICP refresh
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Count this workspace's Closed Won deals and decide whether this win is the 5th
 * since the last recommendation (every-5th cadence).
 *
 * TODO(owner): read closed-won count from local store; compare to last
 * recommendation watermark in `flywheel_metrics`.
 */
export async function shouldRecommendIcpRefresh(
  _workspaceId: string,
  _closedWonCount: number,
): Promise<boolean> {
  // TODO(owner): implement every-5th-win cadence check.
  throw new Error('not implemented');
}

/**
 * Build the icp.refresh_recommended payload (Claude Sonnet 4.6, Engine 01 Mode B
 * pipeline) summarising what changed across the new closed-won cohort.
 *
 * TODO(owner): assemble account_attributes + recommended_changes_summary via the
 * ICP refresh analysis LLM task.
 */
export async function buildIcpRefreshRecommendation(
  _workspaceId: string,
  _payload: CrmDealClosedWonPayload,
): Promise<IcpRefreshRecommendedPayload> {
  // TODO(owner): implement ICP refresh recommendation assembly.
  throw new Error('not implemented');
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 6 — on Closed Lost: update anti-ICP + exclusion suggestions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * On crm.deal_closed_lost: record the loss and update the anti-ICP model,
 * surfacing approve/dismiss exclusion suggestion cards.
 *
 * TODO(owner): write a row to `win_loss_analysis` (outcome='lost') and recompute
 * lost-deal attribute patterns for the suggestions UI.
 */
export async function updateAntiIcp(
  _workspaceId: string,
  _payload: CrmDealClosedLostPayload,
): Promise<void> {
  // TODO(owner): implement anti-ICP update + exclusion suggestion generation.
  throw new Error('not implemented');
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 7 — weekly digest email (Mondays)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate and send the weekly metrics digest (Claude Haiku 4.5 narrative, sent
 * via Resend). Invoked by a Monday cron, not by an event.
 *
 * TODO(owner): render metrics → Haiku narrative → Resend send.
 */
export async function sendWeeklyDigest(_workspaceId: string): Promise<void> {
  // TODO(owner): implement weekly digest generation + Resend delivery.
  throw new Error('not implemented');
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 8 — assemble the flywheel.metrics_updated payload
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the flywheel.metrics_updated payload from the latest tier metrics. The
 * handler publishes it daily or on significant change AFTER the completion check.
 *
 * TODO(owner): diff against the previous snapshot to populate metric_keys_changed.
 */
export async function buildMetricsUpdatedPayload(
  _workspaceId: string,
): Promise<FlywheelMetricsUpdatedPayload> {
  // TODO(owner): implement payload assembly from pipeline_snapshots / flywheel_metrics.
  throw new Error('not implemented');
}
