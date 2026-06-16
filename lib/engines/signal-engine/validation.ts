/**
 * Signal Engine — payload validation.
 *
 * Conventions: validate every incoming payload BEFORE processing it
 * (conventions.md). Each consumed event gets a guard returning a typed result;
 * `completionCheck` encodes the doc's verbatim "Task completion check" list and
 * gates the success publish (verify-before-publish, ADR-003).
 */

import type { ContactsMappedPayload, SignalReceivedPayload } from '../../events';

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

/**
 * Validate the `contacts.mapped` payload before we attribute its contacts to an
 * account's incoming signals.
 */
export function validateContactsMapped(payload: ContactsMappedPayload): ValidationResult {
  const errors: string[] = [];

  if (!payload || typeof payload !== 'object') {
    return { ok: false, errors: ['payload is missing or not an object'] };
  }
  if (typeof payload.account_id !== 'string' || payload.account_id.length === 0) {
    errors.push('account_id must be a non-empty string');
  }
  if (![1, 2, 3].includes(payload.tier)) {
    errors.push('tier must be 1, 2, or 3');
  }
  if (!Array.isArray(payload.contact_ids)) {
    errors.push('contact_ids must be an array');
  }

  return { ok: errors.length === 0, errors };
}

/**
 * Structural guard for an outgoing `signal.received` payload. Run before
 * publishing so we never emit a malformed signal onto the bus.
 */
export function validateSignalReceived(payload: SignalReceivedPayload): ValidationResult {
  const errors: string[] = [];

  if (!payload || typeof payload !== 'object') {
    return { ok: false, errors: ['payload is missing or not an object'] };
  }
  if (typeof payload.account_id !== 'string' || payload.account_id.length === 0) {
    errors.push('account_id must be a non-empty string');
  }
  if (typeof payload.signal_type !== 'string' || payload.signal_type.length === 0) {
    errors.push('signal_type must be a non-empty string');
  }
  if (typeof payload.signal_source !== 'string' || payload.signal_source.length === 0) {
    errors.push('signal_source must be a non-empty string');
  }
  if (typeof payload.points_awarded !== 'number') {
    errors.push('points_awarded must be a number');
  }
  if (typeof payload.dedup_key !== 'string' || payload.dedup_key.length === 0) {
    errors.push('dedup_key must be a non-empty string');
  }

  return { ok: errors.length === 0, errors };
}

/**
 * Inputs to the task-completion check. The owner fills these from the live job
 * (TAL match, Redis dedup result, DB write result, publish result).
 */
export interface SignalCompletionInputs {
  /** A valid signal was matched to a TAL account (account_id resolved). */
  matchedToTalAccount: boolean;
  /** Signal deduplicated — idempotency key prevents double-counting. */
  deduplicated: boolean;
  /** Signal normalised to the common schema AND stored in `signals`. */
  normalisedAndStored: boolean;
  /** `signal.received` event published. */
  eventPublished: boolean;
}

/**
 * Encodes the engine-07 doc's "Task completion check" list verbatim. The engine
 * marks its work complete only when ALL are true; otherwise it publishes an
 * error event instead of a success event.
 *
 * Doc checklist:
 *   - [ ] A valid signal is matched to a TAL account
 *   - [ ] Signal deduplicated (idempotency key prevents double-counting)
 *   - [ ] Signal normalised to the common schema and stored
 *   - [ ] `signal.received` event published
 */
export function completionCheck(inputs: SignalCompletionInputs): { ok: boolean; failed: string[] } {
  const failed: string[] = [];

  if (!inputs.matchedToTalAccount) {
    failed.push('A valid signal is matched to a TAL account');
  }
  if (!inputs.deduplicated) {
    failed.push('Signal deduplicated (idempotency key prevents double-counting)');
  }
  if (!inputs.normalisedAndStored) {
    failed.push('Signal normalised to the common schema and stored');
  }
  if (!inputs.eventPublished) {
    failed.push('`signal.received` event published');
  }

  return { ok: failed.length === 0, failed };
}
