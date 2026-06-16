/**
 * Validation for the Contact Engine (#06).
 *
 *  - One cheap structural validator per CONSUMED event payload, run before any
 *    processing (conventions.md). These are guards, not business rules.
 *  - `completionCheck` encodes the doc's verbatim "Task completion check" list.
 *    The engine publishes `contacts.mapped` ONLY when this returns { ok: true }
 *    (verify-before-publish, ADR-003); otherwise it publishes
 *    `contacts.sourcing_failed`.
 *
 * @see ../../../docs/engines/engine-06-contact-engine.md
 */

import type { TalFinalizedPayload } from '../../events';

/**
 * Structural validation for the `tal.finalized` payload (the trigger event).
 * Confirms the fields the engine relies on are present and well-typed. Throws on
 * the first problem so the worker can fail-fast and retry/dead-letter.
 */
export function validateTalFinalizedPayload(payload: TalFinalizedPayload): void {
  if (typeof payload !== 'object' || payload === null) {
    throw new Error('[contact-engine] tal.finalized: payload is not an object');
  }
  if (typeof payload.tal_id !== 'string' || payload.tal_id.length === 0) {
    throw new Error('[contact-engine] tal.finalized: tal_id must be a non-empty string');
  }
  if (
    typeof payload.tier1_count !== 'number' ||
    typeof payload.tier2_count !== 'number' ||
    typeof payload.tier3_count !== 'number'
  ) {
    throw new Error('[contact-engine] tal.finalized: tier*_count must be numbers');
  }
  if (typeof payload.account_count !== 'number') {
    throw new Error('[contact-engine] tal.finalized: account_count must be a number');
  }
  if (typeof payload.finalized_at !== 'string') {
    throw new Error('[contact-engine] tal.finalized: finalized_at must be an ISO timestamp string');
  }
}

/**
 * Inputs the completion check needs from a per-account sourcing run. The owner
 * wires real values from the service layer (contacts sourced + verified, role
 * assignment outcome, CRM write-back confirmation from Engine 10, and the
 * published-event ack).
 */
export interface CompletionCheckInput {
  /** Whether this account is Tier 1 (Tier 1 has a stricter "at least one contact" rule). */
  isTier1: boolean;
  /** At least one verified, role-assigned contact exists for the account. */
  hasVerifiedRoleAssignedContact: boolean;
  /** Every sourced contact carries a verified email status (valid / risky / invalid). */
  allContactsHaveVerifiedEmailStatus: boolean;
  /** Contacts pushed to CRM with stakeholder-role properties, confirmed via Engine 10. */
  crmPushConfirmed: boolean;
  /** `contacts.mapped` was published for this account and confirmed. */
  contactsMappedEventPublished: boolean;
}

/**
 * Verbatim "Task completion check" from engine-06-contact-engine.md.
 * Returns { ok, failed } — `failed` lists the human-readable checks that did not
 * pass. The engine publishes `contacts.mapped` only when `ok` is true; otherwise
 * it must publish `contacts.sourcing_failed` (see README "Failure handling").
 */
export function completionCheck(input: CompletionCheckInput): { ok: boolean; failed: string[] } {
  const failed: string[] = [];

  // "Each Tier 1 account has at least one verified, role-assigned contact"
  if (input.isTier1 && !input.hasVerifiedRoleAssignedContact) {
    failed.push('Each Tier 1 account has at least one verified, role-assigned contact');
  }
  // "Every contact has a verified email status (valid / risky / invalid)"
  if (!input.allContactsHaveVerifiedEmailStatus) {
    failed.push('Every contact has a verified email status (valid / risky / invalid)');
  }
  // "Contacts pushed to CRM with stakeholder role properties (confirmed via Engine 10)"
  if (!input.crmPushConfirmed) {
    failed.push('Contacts pushed to CRM with stakeholder role properties (confirmed via Engine 10)');
  }
  // "`contacts.mapped` event published per account"
  if (!input.contactsMappedEventPublished) {
    failed.push('`contacts.mapped` event published per account');
  }

  return { ok: failed.length === 0, failed };
}
