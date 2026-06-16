/**
 * Publisher — the ONLY place engine 03 emits events.
 *
 * One thin, strongly-typed function per PUBLISHED event. Each wraps the shared
 * `publishEvent` so call-sites cannot pass a mismatched payload. Publish a
 * success event (`accounts.enriched`) ONLY after the task-completion check
 * passes (verify-before-publish, ADR-003); otherwise publish the engine's error
 * event (`enrichment.failed`).
 *
 * @see ../../../docs/engines/engine-03-enrichment-engine.md
 */

import { publishEvent } from '../../events';
import type {
  AccountsEnrichedPayload,
  EnrichmentFailedPayload,
} from '../../events';

/** Context carried through every published event (workspace + correlation id). */
export interface PublishCtx {
  workspaceId: string;
  correlationId?: string;
}

/**
 * Publish `accounts.enriched`. Consumed by the Scoring Engine (04).
 * Emit ONLY after `completionCheck` returns `{ ok: true }`.
 */
export async function publishAccountsEnriched(
  payload: AccountsEnrichedPayload,
  ctx: PublishCtx,
): Promise<void> {
  await publishEvent('accounts.enriched', payload, ctx);
}

/**
 * Publish `enrichment.failed`. Terminal (no engine consumes it) — surfaced to
 * ops/observability. Emit when the task-completion check fails.
 */
export async function publishEnrichmentFailed(
  payload: EnrichmentFailedPayload,
  ctx: PublishCtx,
): Promise<void> {
  await publishEvent('enrichment.failed', payload, ctx);
}
