/**
 * Payload validation + task-completion check for the CRM Sync Engine (engine 10).
 *
 * Validation is intentionally CHEAP and STRUCTURAL — it guards the handler against
 * malformed payloads before any CRM I/O. Deeper business validation lives in the
 * service layer. (conventions.md: validate incoming event payloads before processing.)
 */

import type {
  TalFinalizedPayload,
  ContactsMappedPayload,
  AccountScoreUpdatedPayload,
  PlayFiredPayload,
} from '../../events';

export interface ValidationResult {
  ok: boolean;
  failed: string[];
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string');
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-consumed-event payload validators
// ─────────────────────────────────────────────────────────────────────────────

/** `tal.finalized` — TAL Manager finalised a Target Account List to sync to the CRM. */
export function validateTalFinalized(payload: TalFinalizedPayload): ValidationResult {
  const failed: string[] = [];
  if (!isNonEmptyString(payload?.tal_id)) failed.push('tal_id must be a non-empty string');
  if (typeof payload?.account_count !== 'number') failed.push('account_count must be a number');
  if (!isNonEmptyString(payload?.status)) failed.push('status must be a non-empty string');
  if (!isNonEmptyString(payload?.finalized_at)) failed.push('finalized_at must be an ISO timestamp');
  return { ok: failed.length === 0, failed };
}

/** `contacts.mapped` — Contact Engine mapped contacts/roles to push into the CRM. */
export function validateContactsMapped(payload: ContactsMappedPayload): ValidationResult {
  const failed: string[] = [];
  if (!isNonEmptyString(payload?.account_id)) failed.push('account_id must be a non-empty string');
  if (!isStringArray(payload?.contact_ids)) failed.push('contact_ids must be a string[]');
  if (typeof payload?.tier !== 'number') failed.push('tier must be a number (1|2|3)');
  return { ok: failed.length === 0, failed };
}

/** `account.score_updated` — Awareness Engine recomputed a score to write back to the CRM. */
export function validateAccountScoreUpdated(payload: AccountScoreUpdatedPayload): ValidationResult {
  const failed: string[] = [];
  if (!isNonEmptyString(payload?.account_id)) failed.push('account_id must be a non-empty string');
  if (typeof payload?.current_score !== 'number') failed.push('current_score must be a number');
  if (!isNonEmptyString(payload?.stage)) failed.push('stage must be a non-empty string');
  if (!isNonEmptyString(payload?.last_calculated_at)) failed.push('last_calculated_at must be an ISO timestamp');
  return { ok: failed.length === 0, failed };
}

/** `play.fired` — Demand-Gen Orchestrator fired a play; its log must reach the CRM. */
export function validatePlayFired(payload: PlayFiredPayload): ValidationResult {
  const failed: string[] = [];
  if (!isNonEmptyString(payload?.play_id)) failed.push('play_id must be a non-empty string');
  if (!isNonEmptyString(payload?.account_id)) failed.push('account_id must be a non-empty string');
  if (!isNonEmptyString(payload?.play_type)) failed.push('play_type must be a non-empty string');
  if (!isNonEmptyString(payload?.fired_at)) failed.push('fired_at must be an ISO timestamp');
  return { ok: failed.length === 0, failed };
}

// ─────────────────────────────────────────────────────────────────────────────
// Task completion check (verbatim from the engine doc) — verify before publish.
// ADR-003: publish the success event ONLY when ALL of these pass; otherwise the
// engine must publish its error event instead of a success event.
// ─────────────────────────────────────────────────────────────────────────────

/** The facts a sync job must establish before `crm.synced` may be published. */
export interface CompletionFacts {
  /** All queued writes for a batch confirmed by the CRM API. */
  allBatchWritesConfirmed: boolean;
  /** Failed records logged to dead-letter queue with retry status. */
  failedRecordsDeadLettered: boolean;
  /** Inbound deal webhooks parsed and corresponding events published. */
  inboundWebhooksParsedAndPublished: boolean;
  /** `crm.synced` event published with record counts and errors. */
  crmSyncedEventPublished: boolean;
}

/**
 * Encodes the doc's verbatim "Task completion check" list. The engine marks its
 * work complete only when ALL of these are true.
 */
export function completionCheck(facts: CompletionFacts): { ok: boolean; failed: string[] } {
  const failed: string[] = [];
  if (!facts.allBatchWritesConfirmed) {
    failed.push('All queued writes for a batch confirmed by the CRM API');
  }
  if (!facts.failedRecordsDeadLettered) {
    failed.push('Failed records logged to dead-letter queue with retry status');
  }
  if (!facts.inboundWebhooksParsedAndPublished) {
    failed.push('Inbound deal webhooks parsed and corresponding events published');
  }
  if (!facts.crmSyncedEventPublished) {
    failed.push('crm.synced event published with record counts and errors');
  }
  return { ok: failed.length === 0, failed };
}
