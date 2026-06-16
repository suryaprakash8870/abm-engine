/**
 * Event handlers for the ICP Engine.
 *
 * One handler per CONSUMED event (per the catalog routing for `icp-engine`):
 *   - play.outcome_recorded     (from Demand Gen Orchestrator)
 *   - crm.deal_closed_won        (from CRM Sync)
 *   - crm.deal_closed_lost       (from CRM Sync)
 *   - icp.refresh_recommended    (from GTM Flywheel)
 *
 * These are the FEEDBACK loop: they let the ICP be re-evaluated and re-versioned
 * as real outcomes land. The ICP's primary build path (wizard / CRM / CSV) is an
 * HTTP flow under app/api/v1/icp/*, not an event handler.
 *
 * Contract (conventions.md, ADR-003): validate the payload first, do the work,
 * then publish a success event ONLY after the task-completion check passes —
 * otherwise publish `icp.error`.
 */

import type { EventEnvelope } from '../../events';
import {
  validatePlayOutcomeRecorded,
  validateCrmDealClosedWon,
  validateCrmDealClosedLost,
  validateIcpRefreshRecommended,
} from './validation';
import { publishIcpUpdated, publishIcpError } from './publisher';

/**
 * A play's outcome was recorded. Feeds the ICP's "what actually converts" signal.
 * May (eventually) nudge ICP confidence and trigger a re-version.
 */
export async function handlePlayOutcomeRecorded(
  event: EventEnvelope<'play.outcome_recorded'>,
): Promise<void> {
  if (!validatePlayOutcomeRecorded(event.payload)) {
    throw new Error('[icp-engine] invalid play.outcome_recorded payload');
  }
  const ctx = { workspaceId: event.workspace_id, correlationId: event.correlation_id };

  // TODO(owner): core logic — fold the play outcome into ICP confidence history;
  // decide whether the change is material enough to cut a new ICP version.
  // Reference models: icp_confidence_history, icp_versions, icp_definitions.
  // On material change → publishIcpUpdated(...) after the completion check passes;
  // on failure → publishIcpError(...).
  void ctx;
  void publishIcpUpdated;
  void publishIcpError;
}

/**
 * A deal closed won. Strongest possible signal of real ICP fit — accumulate and,
 * once enough new wins land, recommend/perform an ICP refresh.
 */
export async function handleCrmDealClosedWon(
  event: EventEnvelope<'crm.deal_closed_won'>,
): Promise<void> {
  if (!validateCrmDealClosedWon(event.payload)) {
    throw new Error('[icp-engine] invalid crm.deal_closed_won payload');
  }
  const ctx = { workspaceId: event.workspace_id, correlationId: event.correlation_id };

  // TODO(owner): core logic — record the won deal's account attributes against the
  // current ICP; recompute fit distribution; if the won cohort drifts from the ICP,
  // re-run the analysis pipeline and cut a new version.
  // Reference models: crm_analysis_jobs, icp_definitions, icp_versions.
  // Success → publishIcpUpdated(...) (verify-before-publish); failure → publishIcpError(...).
  void ctx;
}

/**
 * A deal closed lost. Negative-fit signal — feeds exclusions/disqualifiers in the ICP.
 */
export async function handleCrmDealClosedLost(
  event: EventEnvelope<'crm.deal_closed_lost'>,
): Promise<void> {
  if (!validateCrmDealClosedLost(event.payload)) {
    throw new Error('[icp-engine] invalid crm.deal_closed_lost payload');
  }
  const ctx = { workspaceId: event.workspace_id, correlationId: event.correlation_id };

  // TODO(owner): core logic — fold the lost deal + lost_reason into the ICP's
  // exclusions; if patterns emerge, re-version the ICP.
  // Reference models: crm_analysis_jobs, icp_definitions, icp_versions.
  // Success → publishIcpUpdated(...); failure → publishIcpError(...).
  void ctx;
}

/**
 * The GTM Flywheel recommends refreshing the ICP (enough new closed-won accounts
 * with shared attributes). Act on the recommendation and re-version the ICP.
 */
export async function handleIcpRefreshRecommended(
  event: EventEnvelope<'icp.refresh_recommended'>,
): Promise<void> {
  if (!validateIcpRefreshRecommended(event.payload)) {
    throw new Error('[icp-engine] invalid icp.refresh_recommended payload');
  }
  const ctx = { workspaceId: event.workspace_id, correlationId: event.correlation_id };

  // TODO(owner): core logic — apply the flywheel's recommended_changes_summary,
  // re-run synthesis/interpretation with Claude Sonnet, snapshot a new version.
  // Reference models: icp_definitions, icp_versions, icp_confidence_history.
  // Success → publishIcpUpdated(..., update_source: 'flywheel_feedback') after the
  // completion check passes; failure → publishIcpError(...).
  void ctx;
}
