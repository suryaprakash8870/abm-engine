/**
 * Handlers — one async handler per CONSUMED event.
 *
 * Engine 03 consumes:
 *   - `tam.search_completed` (the enrichment trigger from TAM Builder)
 *   - `icp.created`          (stores the ICP definition locally for qualification context)
 *
 * Each handler: validate the payload → core logic (TODO owner) → publish the
 * appropriate event. Per ADR-003, `accounts.enriched` is published ONLY after
 * `completionCheck` passes; otherwise `enrichment.failed` is published.
 *
 * @see ../../../docs/engines/engine-03-enrichment-engine.md
 */

import type { EventEnvelope } from '../../events';
import {
  validateIcpCreated,
  validateTamSearchCompleted,
} from './validation';
import {
  publishAccountsEnriched,
  publishEnrichmentFailed,
  type PublishCtx,
} from './publisher';

/**
 * Handle `tam.search_completed` — the main enrichment + qualification pipeline.
 *
 * Flow (see service.ts for the step-by-step job):
 *   startEnrichmentJob → per-batch: checkEnrichmentCache → enrichFirmographics →
 *   enrichTechStack → qualifyAccounts → flagLowConfidence → sampleForSpotCheck →
 *   buildQualitySummary → completionCheck → publish.
 */
export async function handleTamSearchCompleted(
  event: EventEnvelope<'tam.search_completed'>,
): Promise<void> {
  const validation = validateTamSearchCompleted(event);
  if (!validation.ok) {
    throw new Error(
      `[enrichment-engine] invalid tam.search_completed payload: ${validation.errors.join('; ')}`,
    );
  }

  const ctx: PublishCtx = {
    workspaceId: event.workspace_id,
    correlationId: event.correlation_id,
  };

  // TODO(owner): core logic — run the step-by-step enrichment + qualification job
  // (service.ts), then call completionCheck(...) on the resulting job state. The
  // wiring below is a compiling stub illustrating verify-before-publish (ADR-003).
  //
  //   const check = completionCheck(jobState);
  //   if (!check.ok) {
  //     await publishEnrichmentFailed({ ...errorPayload, failed_checks: check.failed }, ctx);
  //     return;
  //   }
  //   await publishAccountsEnriched({ ...successPayload }, ctx);

  // Placeholder so the handler references both publish paths and stays type-safe.
  void publishAccountsEnriched;
  void publishEnrichmentFailed;
  void ctx;
}

/**
 * Handle `icp.created` — cache the ICP definition locally so the qualification
 * step has fresh ICP context without querying the ICP Engine's tables.
 * Does NOT publish an event.
 */
export async function handleIcpCreated(
  event: EventEnvelope<'icp.created'>,
): Promise<void> {
  const validation = validateIcpCreated(event);
  if (!validation.ok) {
    throw new Error(
      `[enrichment-engine] invalid icp.created payload: ${validation.errors.join('; ')}`,
    );
  }

  // TODO(owner): core logic — storeIcpDefinition(workspace_id, icp_id, definition)
  // so qualifyAccounts can read the ICP locally. No event is published here.
  void event;
}
