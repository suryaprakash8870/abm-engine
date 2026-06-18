/**
 * Signal Engine — event handlers.
 *
 * One async handler per CONSUMED event. Each handler:
 *   1. validates the incoming payload (validation.ts) — conventions.md,
 *   2. runs the core logic (TODO(owner)),
 *   3. publishes a downstream event via the publisher when warranted.
 *
 * Consumed events (per the catalog / engine-07 doc):
 *   - contacts.mapped  (from Contact Engine / 06)
 *
 * NOTE: the engine's primary signal intake is via HTTP routes/webhooks
 * (POST /api/v1/signals/track, POST /api/v1/webhooks/*). The `contacts.mapped`
 * subscription keeps the contact attribution map fresh so incoming signals can
 * be tied to specific contacts on an account.
 */

import type { EventEnvelope } from '../../events';
import { validateContactsMapped } from './validation';
import { setAccountAttribution } from './service';

/**
 * Handle `contacts.mapped` from the Contact Engine. We refresh the
 * account→contacts attribution map so that subsequently-received signals for
 * this account can be attributed to a specific contact_id.
 *
 * This handler does NOT itself publish `signal.received` — signals enter via the
 * HTTP/webhook routes and are published from there once the task-completion
 * check passes. It only updates local attribution state.
 */
export async function handleContactsMapped(
  event: EventEnvelope<'contacts.mapped'>,
): Promise<void> {
  const { ok, errors } = validateContactsMapped(event.payload);
  if (!ok) {
    throw new Error(`[signal-engine] invalid contacts.mapped payload: ${errors.join('; ')}`);
  }

  // Cache the account's primary contact (the decision-maker, else first mapped)
  // so subsequently-received signals for this account attribute to a contact_id.
  // Best-effort + no downstream event — signals publish from the HTTP intake path.
  const primary = event.payload.dm_contact_ids?.[0] ?? event.payload.contact_ids?.[0] ?? null;
  await setAccountAttribution(event.workspace_id, event.payload.account_id, primary);
}
