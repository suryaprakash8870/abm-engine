/**
 * Publisher — the ONLY place engine 04 emits events.
 *
 * One thin, strongly-typed function per PUBLISHED event. Each wraps the shared
 * `publishEvent` so call-sites cannot pass a mismatched payload. Publish a
 * success event (`accounts.scored`) ONLY after the task-completion check passes
 * (verify-before-publish, ADR-003); otherwise publish the engine's error event
 * (`scoring.failed`).
 *
 * @see ../../../docs/engines/engine-04-scoring-engine.md
 */

import { publishEvent } from '../../events';
import type { AccountsScoredPayload, ScoringFailedPayload } from '../../events';

/** Context carried through every published event (workspace + correlation id). */
export interface PublishCtx {
  workspaceId: string;
  correlationId?: string;
}

/**
 * Publish `accounts.scored`. Consumed by the TAL Manager (05).
 * Emit ONLY after `completionCheck` returns `{ ok: true }`.
 */
export async function publishAccountsScored(
  payload: AccountsScoredPayload,
  ctx: PublishCtx,
): Promise<void> {
  await publishEvent('accounts.scored', payload, ctx);
}

/**
 * Publish `scoring.failed`. Terminal (no engine consumes it) — surfaced to
 * ops/observability. Emit when the task-completion check fails.
 */
export async function publishScoringFailed(
  payload: ScoringFailedPayload,
  ctx: PublishCtx,
): Promise<void> {
  await publishEvent('scoring.failed', payload, ctx);
}
