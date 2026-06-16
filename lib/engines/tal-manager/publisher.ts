/**
 * Publishers for the TAL Manager engine (#05).
 *
 * One thin, strongly-typed function per PUBLISHED event. Each wraps
 * `publishEvent` so handlers/services never touch the bus primitives directly.
 *
 * VERIFY-BEFORE-PUBLISH (ADR-003): callers must run the task-completion check
 * (see validation.ts `completionCheck`) BEFORE invoking `publishTalFinalized`.
 *
 * Published by this engine (catalog source of truth):
 *   - tal.finalized
 */

import { publishEvent } from '../../events';
import type { TalFinalizedPayload } from '../../events';
import type { PublishContext } from '../../events/envelope';

/**
 * Emit `tal.finalized` once a new immutable TAL version has been created,
 * suppression applied, and CRM properties/lists written (Engine 10).
 * Consumed by Contact Engine (06) and CRM Sync (10).
 */
export async function publishTalFinalized(
  payload: TalFinalizedPayload,
  ctx: PublishContext,
): Promise<void> {
  await publishEvent('tal.finalized', payload, ctx);
}
