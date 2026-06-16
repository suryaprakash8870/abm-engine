/**
 * Payload validation for the ICP Engine.
 *
 * Cheap STRUCTURAL guards (conventions.md): every consumer validates the payload
 * before processing. These check shape only — deep business validation is the
 * owner's job inside the service.
 *
 * `completionCheck` encodes the doc's verbatim "Task completion check" list and is
 * the gate that must pass BEFORE publishing a success event (ADR-003).
 */

import type {
  PlayOutcomeRecordedPayload,
  CrmDealClosedWonPayload,
  CrmDealClosedLostPayload,
  IcpRefreshRecommendedPayload,
} from '../../events';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

/** Structural guard for `play.outcome_recorded`. */
export function validatePlayOutcomeRecorded(
  payload: unknown,
): payload is PlayOutcomeRecordedPayload {
  if (!isRecord(payload)) return false;
  return (
    typeof payload.play_id === 'string' &&
    typeof payload.account_id === 'string' &&
    typeof payload.outcome === 'string' &&
    typeof payload.recorded_at === 'string'
  );
}

/** Structural guard for `crm.deal_closed_won`. */
export function validateCrmDealClosedWon(
  payload: unknown,
): payload is CrmDealClosedWonPayload {
  if (!isRecord(payload)) return false;
  return (
    typeof payload.deal_id === 'string' &&
    typeof payload.crm_type === 'string' &&
    typeof payload.domain === 'string' &&
    typeof payload.stage === 'string' &&
    typeof payload.closed_at === 'string'
  );
}

/** Structural guard for `crm.deal_closed_lost`. */
export function validateCrmDealClosedLost(
  payload: unknown,
): payload is CrmDealClosedLostPayload {
  if (!isRecord(payload)) return false;
  return (
    typeof payload.deal_id === 'string' &&
    typeof payload.crm_type === 'string' &&
    typeof payload.domain === 'string' &&
    typeof payload.stage === 'string' &&
    typeof payload.closed_at === 'string'
  );
}

/** Structural guard for `icp.refresh_recommended`. */
export function validateIcpRefreshRecommended(
  payload: unknown,
): payload is IcpRefreshRecommendedPayload {
  if (!isRecord(payload)) return false;
  return (
    typeof payload.closed_won_count === 'number' &&
    typeof payload.trigger_deal_id === 'string' &&
    Array.isArray(payload.new_closed_won_deal_ids) &&
    isRecord(payload.account_attributes) &&
    typeof payload.recommended_changes_summary === 'string'
  );
}

/**
 * Input for the verify-before-publish gate. Mirrors the facts the doc's
 * "Task completion check" list needs to assert.
 */
export interface CompletionCheckInput {
  /** ICP object passed schema validation against the ICPDefinition interface. */
  schemaValid: boolean;
  /** confidence_score populated for the ICP as a whole. */
  icpConfidencePopulated: boolean;
  /** confidence populated for EVERY criterion. */
  everyCriterionConfidencePopulated: boolean;
  /** icp.created was published AND confirmed received by a test consumer. */
  createdEventConfirmedByConsumer: boolean;
}

/**
 * The doc's verbatim "Task completion check" — ALL must be true before publishing
 * a success event. The UI "ICP complete" state is derived from the same checks.
 *
 * From engine-01-icp-engine.md:
 *   - ICP object passes schema validation against the ICPDefinition TypeScript interface
 *   - confidence_score field is populated for the ICP and every criterion
 *   - `icp.created` event is published AND confirmed received by a test consumer
 *   - UI shows 'ICP complete' only after all three above are true
 */
export function completionCheck(
  input: CompletionCheckInput,
): { ok: boolean; failed: string[] } {
  const failed: string[] = [];

  if (!input.schemaValid) {
    failed.push('ICP object passes schema validation against the ICPDefinition TypeScript interface');
  }
  if (!input.icpConfidencePopulated || !input.everyCriterionConfidencePopulated) {
    failed.push('confidence_score field is populated for the ICP and every criterion');
  }
  if (!input.createdEventConfirmedByConsumer) {
    failed.push('`icp.created` event is published AND confirmed received by a test consumer');
  }
  // The UI "ICP complete" gate is the conjunction of the three above.
  if (failed.length > 0) {
    failed.push("UI shows 'ICP complete' only after all three above are true");
  }

  return { ok: failed.length === 0, failed };
}
