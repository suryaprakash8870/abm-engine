/**
 * Signal Engine — event publishers.
 *
 * One thin, strongly-typed wrapper per PUBLISHED event. Engines never touch
 * Redis/BullMQ directly; they call publishEvent() AFTER the task-completion
 * check passes (verify-before-publish, ADR-003).
 *
 * Published events (per the catalog / engine-07 doc):
 *   - signal.received  (consumed by Awareness Engine / 08)
 */

import { publishEvent } from '../../events';
import type { SignalReceivedPayload } from '../../events';
import type { PublishContext } from '../../events';

/**
 * Publish `signal.received` for a valid, deduplicated, normalised signal.
 * Call ONLY after completionCheck() passes. Consumed by the Awareness Engine (08).
 */
export async function publishSignalReceived(
  payload: SignalReceivedPayload,
  ctx: PublishContext,
): Promise<void> {
  await publishEvent('signal.received', payload, ctx);
}
