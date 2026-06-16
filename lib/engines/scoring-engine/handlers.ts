/**
 * Handlers — one async handler per CONSUMED event.
 *
 * Engine 04 consumes:
 *   - `accounts.enriched` (the scoring trigger from Enrichment Engine, 03)
 *
 * The handler: validate the payload → core logic (TODO owner) → publish the
 * appropriate event. Per ADR-003, `accounts.scored` is published ONLY after
 * `completionCheck` passes; otherwise `scoring.failed` is published.
 *
 * @see ../../../docs/engines/engine-04-scoring-engine.md
 */

import type { EventEnvelope } from '../../events';
import { validateAccountsEnriched } from './validation';
import {
  publishAccountsScored,
  publishScoringFailed,
  type PublishCtx,
} from './publisher';

/**
 * Handle `accounts.enriched` — the main scoring + tiering pipeline.
 *
 * Flow (see service.ts for the step-by-step job):
 *   getOrGenerateFormula → scoreAccounts → assignTiers → storeScoreBreakdowns →
 *   recordTierBoundaries → buildTierSummary → completionCheck → publish.
 *
 * Failure handling (per the doc): if Claude formula generation fails, fall back
 * to a default equal-weight formula and score every account regardless — never
 * block the pipeline. A failed completion check publishes `scoring.failed`.
 */
export async function handleAccountsEnriched(
  event: EventEnvelope<'accounts.enriched'>,
): Promise<void> {
  const validation = validateAccountsEnriched(event);
  if (!validation.ok) {
    throw new Error(
      `[scoring-engine] invalid accounts.enriched payload: ${validation.errors.join('; ')}`,
    );
  }

  const ctx: PublishCtx = {
    workspaceId: event.workspace_id,
    correlationId: event.correlation_id,
  };

  // TODO(owner): core logic — run the step-by-step scoring + tiering job
  // (service.ts), then call completionCheck(...) on the resulting job state. The
  // wiring below is a compiling stub illustrating verify-before-publish (ADR-003).
  //
  //   const check = completionCheck(jobState);
  //   if (!check.ok) {
  //     await publishScoringFailed({ ...errorPayload, failed_check: check.failed.join('; ') }, ctx);
  //     return;
  //   }
  //   await publishAccountsScored({ ...successPayload }, ctx);

  // Placeholder so the handler references both publish paths and stays type-safe.
  void publishAccountsScored;
  void publishScoringFailed;
  void ctx;
}
