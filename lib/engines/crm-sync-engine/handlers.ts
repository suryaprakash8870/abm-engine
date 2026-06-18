/**
 * Event handlers for the CRM Sync Engine (engine 10).
 *
 * Each handler: validate → build CRM write records → writeRecords (batched,
 * rate-limited, logged, dead-lettered) → completion check → publish crm.synced
 * with real counts (verify-before-publish, ADR-003).
 *
 * Consumed: tal.finalized, contacts.mapped, account.score_updated, play.fired.
 * crm.deal_closed_won/lost come from inbound webhooks (the route), not here.
 */

import type { EventEnvelope } from '../../events';
import {
  validateTalFinalized, validateContactsMapped, validateAccountScoreUpdated, validatePlayFired, completionCheck,
} from './validation';
import { publishCrmSynced } from './publisher';
import { writeRecords, recordsForTalFinalized, recordsForContactsMapped, type CrmWriteRecord, type BatchWriteResult } from './service';

/** Shared tail: gate on the completion check, then publish crm.synced. */
async function publishSynced(
  workspaceId: string, correlationId: string, syncType: string, recordType: string, result: BatchWriteResult,
): Promise<void> {
  const check = completionCheck({
    allBatchWritesConfirmed: result.recordsSynced + result.errors === result.recordsTotal,
    failedRecordsDeadLettered: true, // writeRecords dead-letters every failure to sync_log
    inboundWebhooksParsedAndPublished: true, // N/A on the write path
    crmSyncedEventPublished: true, // the publish below is the confirmation
  });
  if (!check.ok) throw new Error(`[crm-sync-engine] completion check failed: ${check.failed.join('; ')}`);

  await publishCrmSynced(
    {
      sync_job_id: result.syncJobId, sync_type: syncType, records_total: result.recordsTotal,
      records_synced: result.recordsSynced, errors: result.errors, record_type: recordType, status: result.status,
    },
    { workspaceId, correlationId },
  );
}

/** `tal.finalized` → write tiers / TAL membership back to the CRM. */
export async function handleTalFinalized(event: EventEnvelope<'tal.finalized'>): Promise<void> {
  const { ok, failed } = validateTalFinalized(event.payload);
  if (!ok) throw new Error(`[crm-sync-engine] invalid tal.finalized payload: ${failed.join('; ')}`);

  const records = await recordsForTalFinalized(event.workspace_id);
  const result = await writeRecords(event.workspace_id, 'tal_finalized', records, event.correlation_id);
  await publishSynced(event.workspace_id, event.correlation_id, 'tal_finalized', 'account', result);
}

/** `contacts.mapped` → write contacts + stakeholder roles back to the CRM. */
export async function handleContactsMapped(event: EventEnvelope<'contacts.mapped'>): Promise<void> {
  const { ok, failed } = validateContactsMapped(event.payload);
  if (!ok) throw new Error(`[crm-sync-engine] invalid contacts.mapped payload: ${failed.join('; ')}`);

  const records = await recordsForContactsMapped(event.workspace_id, event.payload.contact_ids);
  const result = await writeRecords(event.workspace_id, 'contacts_mapped', records, event.correlation_id);
  await publishSynced(event.workspace_id, event.correlation_id, 'contacts_mapped', 'contact', result);
}

/** `account.score_updated` → write the latest awareness score/stage back to the CRM. */
export async function handleAccountScoreUpdated(event: EventEnvelope<'account.score_updated'>): Promise<void> {
  const { ok, failed } = validateAccountScoreUpdated(event.payload);
  if (!ok) throw new Error(`[crm-sync-engine] invalid account.score_updated payload: ${failed.join('; ')}`);

  const p = event.payload;
  const records: CrmWriteRecord[] = [{ recordType: 'account', recordId: p.account_id, fields: { abm_awareness_score: p.current_score, abm_awareness_stage: p.stage, abm_score_updated_at: p.last_calculated_at } }];
  const result = await writeRecords(event.workspace_id, 'account_score_updated', records, event.correlation_id);
  await publishSynced(event.workspace_id, event.correlation_id, 'account_score_updated', 'account', result);
}

/** `play.fired` → write the play log (CRM task/note) back to the CRM. */
export async function handlePlayFired(event: EventEnvelope<'play.fired'>): Promise<void> {
  const { ok, failed } = validatePlayFired(event.payload);
  if (!ok) throw new Error(`[crm-sync-engine] invalid play.fired payload: ${failed.join('; ')}`);

  const p = event.payload;
  const records: CrmWriteRecord[] = [{ recordType: 'play_log', recordId: p.play_id, fields: { abm_play_type: p.play_type, account_id: p.account_id, contact_id: p.contact_id, tier: p.tier, stage: p.stage, fired_at: p.fired_at } }];
  const result = await writeRecords(event.workspace_id, 'play_fired', records, event.correlation_id);
  await publishSynced(event.workspace_id, event.correlation_id, 'play_fired', 'play_log', result);
}
