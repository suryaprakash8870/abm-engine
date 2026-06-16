/**
 * Validation — cheap, structural guards run BEFORE any processing.
 *
 * Two responsibilities:
 *  1. A payload validator per CONSUMED event (`icp.created`, `tam.search_completed`).
 *     These reject malformed events early (conventions.md: validate incoming
 *     payloads before processing).
 *  2. `completionCheck` — the verbatim "Task completion check" list from the doc,
 *     returning `{ ok, failed }`. The handler must call it and publish
 *     `accounts.enriched` ONLY when `ok === true` (verify-before-publish, ADR-003).
 *
 * @see ../../../docs/engines/engine-03-enrichment-engine.md
 */

import type {
  EventEnvelope,
  IcpCreatedPayload,
  TamSearchCompletedPayload,
} from '../../events';

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

/** Structural check for an `icp.created` envelope (stored locally for qualification context). */
export function validateIcpCreated(
  event: EventEnvelope<'icp.created'>,
): ValidationResult {
  const errors: string[] = [];
  const p = event.payload as IcpCreatedPayload | undefined;
  if (!p) {
    errors.push('payload is missing');
    return { ok: false, errors };
  }
  if (typeof p.icp_id !== 'string' || p.icp_id.length === 0) {
    errors.push('icp_id must be a non-empty string');
  }
  if (typeof p.version !== 'number') {
    errors.push('version must be a number');
  }
  if (typeof p.firmographics !== 'object' || p.firmographics === null) {
    errors.push('firmographics must be an object');
  }
  return { ok: errors.length === 0, errors };
}

/** Structural check for a `tam.search_completed` envelope (the enrichment trigger). */
export function validateTamSearchCompleted(
  event: EventEnvelope<'tam.search_completed'>,
): ValidationResult {
  const errors: string[] = [];
  const p = event.payload as TamSearchCompletedPayload | undefined;
  if (!p) {
    errors.push('payload is missing');
    return { ok: false, errors };
  }
  if (typeof p.job_id !== 'string' || p.job_id.length === 0) {
    errors.push('job_id must be a non-empty string');
  }
  if (typeof p.icp_id !== 'string' || p.icp_id.length === 0) {
    errors.push('icp_id must be a non-empty string');
  }
  if (!Array.isArray(p.account_ids)) {
    errors.push('account_ids must be an array');
  }
  if (typeof p.total_found !== 'number') {
    errors.push('total_found must be a number');
  }
  return { ok: errors.length === 0, errors };
}

/**
 * Result of the task-completion gate.
 * `failed` lists the verbatim checks that did not pass.
 */
export interface CompletionCheckResult {
  ok: boolean;
  failed: string[];
}

/**
 * Inputs the completion check inspects. The owner fills these from the job state
 * (enrichment_jobs / enriched_accounts / qualification_results / enrichment_cache).
 */
export interface CompletionCheckInput {
  /** Every account has a successful enrichment record OR a documented failure reason. */
  everyAccountEnrichedOrDocumented: boolean;
  /** AI qualification has run on all enriched accounts. */
  qualificationRanOnAllEnriched: boolean;
  /** Enrichment cache updated for all successfully enriched domains. */
  cacheUpdatedForEnrichedDomains: boolean;
  /** `accounts.enriched` event published and confirmed. */
  accountsEnrichedPublishedAndConfirmed: boolean;
}

/**
 * Encodes the doc's verbatim "Task completion check" list.
 *
 * The engine marks its work complete only when ALL are true. If any check
 * fails, the engine publishes `enrichment.failed` instead of `accounts.enriched`.
 * A half-finished job that reports success is worse than a failed job that
 * reports failure.
 */
export function completionCheck(input: CompletionCheckInput): CompletionCheckResult {
  const failed: string[] = [];
  if (!input.everyAccountEnrichedOrDocumented) {
    failed.push('Every account has a successful enrichment record OR a documented failure reason');
  }
  if (!input.qualificationRanOnAllEnriched) {
    failed.push('AI qualification has run on all enriched accounts');
  }
  if (!input.cacheUpdatedForEnrichedDomains) {
    failed.push('Enrichment cache updated for all successfully enriched domains');
  }
  if (!input.accountsEnrichedPublishedAndConfirmed) {
    failed.push('`accounts.enriched` event published and confirmed');
  }
  return { ok: failed.length === 0, failed };
}
