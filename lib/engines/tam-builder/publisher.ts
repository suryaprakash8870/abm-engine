/**
 * Publishers for the TAM Builder (engine 02).
 *
 * One thin, strongly-typed wrapper per PUBLISHED event. Each delegates to the
 * shared `publishEvent`, the ONLY sanctioned way to emit onto the bus
 * (conventions.md). Handlers/service call these — never `publishEvent` directly —
 * so the payload shape is locked to the frozen contract.
 *
 * Published events (catalog):
 *   - tam.search_completed  (success — emit ONLY after completionCheck passes)
 *   - tam.search_failed     (error path — emit on any failed completion check)
 *
 * See docs/engines/engine-02-tam-builder.md.
 */

import {
  publishEvent,
  type TamSearchCompletedPayload,
  type TamSearchFailedPayload,
} from '../../events';

/** Context carried through every publish: tenant + the pipeline's correlation id. */
export interface PublishCtx {
  workspaceId: string;
  correlationId?: string;
}

/** Success: the raw TAM list is built and stored. Enrichment Engine (03) consumes this. */
export async function publishTamSearchCompleted(
  payload: TamSearchCompletedPayload,
  ctx: PublishCtx,
): Promise<void> {
  await publishEvent('tam.search_completed', payload, ctx);
}

/** Error: the search/build could not complete. Carries the resume checkpoint. */
export async function publishTamSearchFailed(
  payload: TamSearchFailedPayload,
  ctx: PublishCtx,
): Promise<void> {
  await publishEvent('tam.search_failed', payload, ctx);
}
