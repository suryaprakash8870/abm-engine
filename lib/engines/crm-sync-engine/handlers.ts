/**
 * Event handlers for the CRM Sync Engine (engine 10).
 *
 * One handler per CONSUMED event. Each handler:
 *   1. validates the payload (validation.ts),
 *   2. // TODO(owner): runs the core sync logic (service.ts),
 *   3. publishes `crm.synced` ONLY after the task-completion check passes
 *      (verify-before-publish, ADR-003).
 *
 * Consumed events (catalog): tal.finalized, contacts.mapped,
 * account.score_updated, play.fired.
 *
 * NOTE: `crm.deal_closed_won` / `crm.deal_closed_lost` are NOT produced here —
 * they originate from inbound CRM webhooks (POST /api/v1/webhooks/hubspot-deals),
 * not from a consumed bus event. See publisher.ts + service.parseInboundDealWebhook.
 */

import type { EventEnvelope } from '../../events';
import {
  validateTalFinalized,
  validateContactsMapped,
  validateAccountScoreUpdated,
  validatePlayFired,
} from './validation';
import { publishCrmSynced } from './publisher';

/** `tal.finalized` → write tiers / TAL membership back to the CRM. */
export async function handleTalFinalized(
  event: EventEnvelope<'tal.finalized'>,
): Promise<void> {
  const { ok, failed } = validateTalFinalized(event.payload);
  if (!ok) {
    throw new Error(`[crm-sync-engine] invalid tal.finalized payload: ${failed.join('; ')}`);
  }

  // TODO(owner): batch + rate-limit + upsert TAL tiers to the CRM; record sync_log;
  // dead-letter failures; verify completionCheck() before publishing.
  const ctx = { workspaceId: event.workspace_id, correlationId: event.correlation_id };
  await publishCrmSynced(
    {
      sync_job_id: '', // TODO(owner): real sync_jobs id
      sync_type: 'tal_finalized',
      records_total: event.payload.account_count,
      records_synced: 0, // TODO(owner)
      errors: 0, // TODO(owner)
      record_type: 'account',
      status: 'pending', // TODO(owner): set from completionCheck result
    },
    ctx,
  );
}

/** `contacts.mapped` → write contacts + stakeholder roles back to the CRM. */
export async function handleContactsMapped(
  event: EventEnvelope<'contacts.mapped'>,
): Promise<void> {
  const { ok, failed } = validateContactsMapped(event.payload);
  if (!ok) {
    throw new Error(`[crm-sync-engine] invalid contacts.mapped payload: ${failed.join('; ')}`);
  }

  // TODO(owner): upsert contacts + roles (match on email/phone, never overwrite);
  // record sync_log; dead-letter failures; verify completionCheck() before publishing.
  const ctx = { workspaceId: event.workspace_id, correlationId: event.correlation_id };
  await publishCrmSynced(
    {
      sync_job_id: '', // TODO(owner)
      sync_type: 'contacts_mapped',
      records_total: event.payload.contact_ids.length,
      records_synced: 0, // TODO(owner)
      errors: 0, // TODO(owner)
      record_type: 'contact',
      status: 'pending', // TODO(owner)
    },
    ctx,
  );
}

/** `account.score_updated` → write the latest awareness score back to the CRM. */
export async function handleAccountScoreUpdated(
  event: EventEnvelope<'account.score_updated'>,
): Promise<void> {
  const { ok, failed } = validateAccountScoreUpdated(event.payload);
  if (!ok) {
    throw new Error(`[crm-sync-engine] invalid account.score_updated payload: ${failed.join('; ')}`);
  }

  // TODO(owner): upsert the account score/stage to the CRM; record sync_log;
  // dead-letter failures; verify completionCheck() before publishing.
  const ctx = { workspaceId: event.workspace_id, correlationId: event.correlation_id };
  await publishCrmSynced(
    {
      sync_job_id: '', // TODO(owner)
      sync_type: 'account_score_updated',
      records_total: 1,
      records_synced: 0, // TODO(owner)
      errors: 0, // TODO(owner)
      record_type: 'account',
      status: 'pending', // TODO(owner)
    },
    ctx,
  );
}

/** `play.fired` → write the play log (CRM task/note) back to the CRM. */
export async function handlePlayFired(
  event: EventEnvelope<'play.fired'>,
): Promise<void> {
  const { ok, failed } = validatePlayFired(event.payload);
  if (!ok) {
    throw new Error(`[crm-sync-engine] invalid play.fired payload: ${failed.join('; ')}`);
  }

  // TODO(owner): upsert the play log to the CRM; record sync_log;
  // dead-letter failures; verify completionCheck() before publishing.
  const ctx = { workspaceId: event.workspace_id, correlationId: event.correlation_id };
  await publishCrmSynced(
    {
      sync_job_id: '', // TODO(owner)
      sync_type: 'play_fired',
      records_total: 1,
      records_synced: 0, // TODO(owner)
      errors: 0, // TODO(owner)
      record_type: 'play_log',
      status: 'pending', // TODO(owner)
    },
    ctx,
  );
}
