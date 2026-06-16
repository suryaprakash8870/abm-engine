/**
 * Engine 11 — GTM Flywheel · payload validation + task-completion check.
 *
 * Cheap structural guards run on every consumed event BEFORE the handler does any
 * work (conventions.md / ADR-003). These deliberately validate shape only — the
 * envelope itself is already validated by the bus (`isValidEnvelope`).
 *
 * `completionCheck` encodes the doc's verbatim "Task completion check" list. The
 * engine publishes its success event ONLY when this returns { ok: true } —
 * otherwise it publishes `flywheel.error` (verify-before-publish, ADR-003).
 */

import type {
  AccountHotPayload,
  AccountScoreUpdatedPayload,
  CrmDealClosedLostPayload,
  CrmDealClosedWonPayload,
  CrmSyncedPayload,
  IcpUpdatedPayload,
  PlayFiredPayload,
  PlayOutcomeRecordedPayload,
} from '../../events';

// ─────────────────────────────────────────────────────────────────────────────
// Per-consumed-event payload validators
// ─────────────────────────────────────────────────────────────────────────────

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}

export function validateIcpUpdated(payload: IcpUpdatedPayload): boolean {
  return (
    isNonEmptyString(payload.icp_id) &&
    typeof payload.version === 'number' &&
    Array.isArray(payload.changed_fields)
  );
}

export function validateAccountScoreUpdated(payload: AccountScoreUpdatedPayload): boolean {
  return (
    isNonEmptyString(payload.account_id) &&
    typeof payload.current_score === 'number' &&
    typeof payload.stage === 'string'
  );
}

export function validateAccountHot(payload: AccountHotPayload): boolean {
  return (
    isNonEmptyString(payload.account_id) &&
    typeof payload.current_score === 'number' &&
    typeof payload.dominant_signal_type === 'string'
  );
}

export function validatePlayFired(payload: PlayFiredPayload): boolean {
  return (
    isNonEmptyString(payload.play_id) &&
    isNonEmptyString(payload.account_id) &&
    typeof payload.play_type === 'string'
  );
}

export function validatePlayOutcomeRecorded(payload: PlayOutcomeRecordedPayload): boolean {
  return (
    isNonEmptyString(payload.play_id) &&
    isNonEmptyString(payload.account_id) &&
    typeof payload.outcome === 'string'
  );
}

export function validateCrmSynced(payload: CrmSyncedPayload): boolean {
  return (
    isNonEmptyString(payload.sync_job_id) &&
    typeof payload.records_total === 'number' &&
    typeof payload.status === 'string'
  );
}

export function validateCrmDealClosedWon(payload: CrmDealClosedWonPayload): boolean {
  return (
    isNonEmptyString(payload.deal_id) &&
    isNonEmptyString(payload.domain) &&
    isNonEmptyString(payload.closed_at)
  );
}

export function validateCrmDealClosedLost(payload: CrmDealClosedLostPayload): boolean {
  return (
    isNonEmptyString(payload.deal_id) &&
    isNonEmptyString(payload.domain) &&
    isNonEmptyString(payload.closed_at)
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Task completion check (verbatim from engine-11-gtm-flywheel.md)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The inputs the completion check inspects. The owner fills these from the
 * results of the service-layer steps; until then the check is conservatively
 * false so the engine cannot report a half-finished job as success.
 */
export interface CompletionCheckInput {
  /** Attribution built for every closed deal (signal timeline walked back). */
  attributionBuiltForEveryClosedDeal: boolean;
  /** Pipeline/win-rate metrics calculated by tier. */
  pipelineWinRateByTierCalculated: boolean;
  /** Correlation analysis suppressed below 20 data points (no misleading stats). */
  correlationSuppressedBelow20Points: boolean;
  /** `flywheel.metrics_updated` published. */
  metricsUpdatedPublished: boolean;
  /** `icp.refresh_recommended` fired after every 5th win. */
  icpRefreshFiredEvery5thWin: boolean;
}

/**
 * Encodes the doc's "Task completion check" list. Returns the list of failed
 * checks (verbatim strings) so the caller can attach `failed_check` to a
 * `flywheel.error` event when ok === false.
 */
export function completionCheck(input: CompletionCheckInput): { ok: boolean; failed: string[] } {
  const failed: string[] = [];

  if (!input.attributionBuiltForEveryClosedDeal) {
    failed.push('Attribution built for every closed deal (signal timeline walked back)');
  }
  if (!input.pipelineWinRateByTierCalculated) {
    failed.push('Pipeline/win-rate metrics calculated by tier');
  }
  if (!input.correlationSuppressedBelow20Points) {
    failed.push('Correlation analysis suppressed below 20 data points (no misleading stats)');
  }
  if (!input.metricsUpdatedPublished || !input.icpRefreshFiredEvery5thWin) {
    failed.push(
      '`flywheel.metrics_updated` published; `icp.refresh_recommended` fired after every 5th win',
    );
  }

  return { ok: failed.length === 0, failed };
}
