/**
 * Payload validation for the Demand Gen Orchestrator (Engine 09).
 *
 * Cheap, structural checks run BEFORE any processing (conventions.md). These guard
 * the handlers against malformed payloads; deeper business validation lives in the
 * service. The `completionCheck` encodes the doc's verbatim "Task completion check"
 * list and gates the success-event publish (verify-before-publish, ADR-003).
 */

import type {
  AccountStageChangedPayload,
  AccountHotPayload,
} from '../../events';

const AWARENESS_STAGES = new Set([
  'identified',
  'aware',
  'interested',
  'considering',
  'selecting',
]);

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}

/** Structural guard for `account.stage_changed` payloads (trigger event). */
export function validateAccountStageChanged(
  payload: AccountStageChangedPayload,
): { ok: boolean; failed: string[] } {
  const failed: string[] = [];
  if (!isNonEmptyString(payload?.account_id)) failed.push('account_id');
  if (!AWARENESS_STAGES.has(payload?.from_stage)) failed.push('from_stage');
  if (!AWARENESS_STAGES.has(payload?.to_stage)) failed.push('to_stage');
  if (typeof payload?.score !== 'number') failed.push('score');
  if (!isNonEmptyString(payload?.changed_at)) failed.push('changed_at');
  return { ok: failed.length === 0, failed };
}

/** Structural guard for `account.hot` payloads (trigger event). */
export function validateAccountHot(
  payload: AccountHotPayload,
): { ok: boolean; failed: string[] } {
  const failed: string[] = [];
  if (!isNonEmptyString(payload?.account_id)) failed.push('account_id');
  if (typeof payload?.current_score !== 'number') failed.push('current_score');
  if (typeof payload?.score_change !== 'number') failed.push('score_change');
  if (typeof payload?.window_hours !== 'number') failed.push('window_hours');
  if (!AWARENESS_STAGES.has(payload?.stage)) failed.push('stage');
  if (!isNonEmptyString(payload?.dominant_signal_type)) failed.push('dominant_signal_type');
  if (!Array.isArray(payload?.top_recent_signals)) failed.push('top_recent_signals');
  return { ok: failed.length === 0, failed };
}

/**
 * Inputs to the engine's "Task completion check" — populated by the service as it
 * walks the step-by-step job. A success event is published ONLY when this returns
 * `{ ok: true }`; otherwise the engine surfaces an error instead (ADR-003).
 */
export interface PlayCompletionInputs {
  /** Play matrix evaluated and a play template selected. */
  playSelected: boolean;
  /** Suppression checked BEFORE any external call (atomic check-and-lock). */
  suppressionCheckedBeforeExternalCall: boolean;
  /** A CRM task was created and/or a Slack notification was sent. */
  crmTaskOrSlackSent: boolean;
  /** `play.fired` event was published and the play logged in plays_log. */
  playFiredPublishedAndLogged: boolean;
}

/**
 * Encodes the doc's "Task completion check" list verbatim. The engine marks its
 * work complete only when ALL of these are true:
 *   - Play matrix evaluated and correct play selected
 *   - Suppression checked BEFORE any external call (atomic check-and-lock)
 *   - CRM task created and/or Slack notification sent
 *   - `play.fired` event published and logged
 */
export function completionCheck(
  inputs: PlayCompletionInputs,
): { ok: boolean; failed: string[] } {
  const failed: string[] = [];
  if (!inputs.playSelected) {
    failed.push('Play matrix evaluated and correct play selected');
  }
  if (!inputs.suppressionCheckedBeforeExternalCall) {
    failed.push('Suppression checked BEFORE any external call (atomic check-and-lock)');
  }
  if (!inputs.crmTaskOrSlackSent) {
    failed.push('CRM task created and/or Slack notification sent');
  }
  if (!inputs.playFiredPublishedAndLogged) {
    failed.push('play.fired event published and logged');
  }
  return { ok: failed.length === 0, failed };
}
