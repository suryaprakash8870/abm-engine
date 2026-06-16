/**
 * Publishers for the Contact Engine (#06).
 *
 * One thin, strongly-typed function per PUBLISHED event. Each wraps the shared
 * `publishEvent` so handlers/services never touch the bus primitives directly.
 *
 * VERIFY-BEFORE-PUBLISH (ADR-003): callers must run the task-completion check
 * (see validation.ts `completionCheck`) BEFORE invoking `publishContactsMapped`.
 * If the check fails, publish `publishContactsSourcingFailed` instead — never
 * report success on a half-finished job.
 *
 * Published by this engine (catalog source of truth):
 *   - contacts.mapped
 *   - contacts.sourcing_failed
 *
 * @see ../../../docs/engines/engine-06-contact-engine.md
 */

import { publishEvent } from '../../events';
import type {
  ContactsMappedPayload,
  ContactsSourcingFailedPayload,
} from '../../events';
import type { PublishContext } from '../../events/envelope';

/**
 * Publish `contacts.mapped` for a single account once its stakeholder committee
 * has been sourced, verified, role-assigned, and pushed to the CRM.
 * Consumed by Signal Engine (07) and CRM Sync (10). Emit ONLY after
 * `completionCheck` returns `{ ok: true }`.
 */
export async function publishContactsMapped(
  payload: ContactsMappedPayload,
  ctx: PublishContext,
): Promise<void> {
  await publishEvent('contacts.mapped', payload, ctx);
}

/**
 * Publish `contacts.sourcing_failed` for an account whose task-completion check
 * did not pass (e.g. Apollo returned no contacts, no verified/role-assigned
 * contact, CRM push unconfirmed). Terminal (no engine consumes it) — surfaced to
 * ops/observability so the account can be flagged for manual entry.
 */
export async function publishContactsSourcingFailed(
  payload: ContactsSourcingFailedPayload,
  ctx: PublishContext,
): Promise<void> {
  await publishEvent('contacts.sourcing_failed', payload, ctx);
}
