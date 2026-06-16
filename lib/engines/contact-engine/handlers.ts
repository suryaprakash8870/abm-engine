/**
 * Event handlers for the Contact Engine (#06).
 *
 * One async handler per CONSUMED event. Each handler:
 *   1. validates the payload (validation.ts),
 *   2. runs the core logic (service.ts) — stubbed for now,
 *   3. verifies the per-account task-completion check, then publishes
 *      `contacts.mapped` on success or `contacts.sourcing_failed` on failure
 *      (verify-before-publish, ADR-003).
 *
 * Consumes (catalog source of truth):
 *   - tal.finalized  → handleTalFinalized
 *
 * @see ../../../docs/engines/engine-06-contact-engine.md
 */

import type { EventEnvelope } from '../../events';
import type { PublishContext } from '../../events/envelope';
import { validateTalFinalizedPayload } from './validation';
import {
  publishContactsMapped,
  publishContactsSourcingFailed,
} from './publisher';

/**
 * Trigger: TAL Manager (05) finalised the tiered list.
 * For each Tier-1/2 account: source DM/champion/influencer candidates, enrich,
 * verify emails, assign roles (Claude Haiku), dedupe against the CRM, push
 * contacts via Engine 10, then publish `contacts.mapped` per account.
 */
export async function handleTalFinalized(
  event: EventEnvelope<'tal.finalized'>,
): Promise<void> {
  validateTalFinalizedPayload(event.payload);

  const ctx: PublishContext = {
    workspaceId: event.workspace_id,
    correlationId: event.correlation_id,
  };

  // TODO(owner): core logic — orchestrate the step-by-step job per account via service.ts:
  //   1. loadAccountsToProcess(workspaceId, payload)          // Tier 1 first, then Tier 2
  //   For each account:
  //   1b. startSourcingJob(workspaceId, accountId, tier)
  //   2.  deriveSearchCriteria(workspaceId, tier)
  //   3.  searchCandidates(workspaceId, accountId, criteria)  // no contacts → sourcing_failed
  //   4.  enrichContacts(workspaceId, candidates)
  //   5.  verifyEmails(workspaceId, candidates)               // 'risky' kept with warning
  //   6.  assignStakeholderRoles(workspaceId, candidates)     // Claude Haiku, conf > 0.75
  //   7.  deduplicateAgainstCrm(workspaceId, candidates)
  //   8.  pushContactsToCrm(workspaceId, accountId, assignments)  // via Engine 10; await ack
  //   9.  buildStakeholderMap(workspaceId, accountId, assignments)
  //   Then build CompletionCheckInput and run completionCheck(...) BEFORE publishing.
  //
  //   const check = completionCheck(input);
  //   if (!check.ok) {
  //     await publishContactsSourcingFailed(
  //       { account_id, tier, reason: check.failed.join('; '), failed_check: check.failed[0] ?? '',
  //         contacts_found },
  //       ctx,
  //     );
  //     return;
  //   }
  //   await publishContactsMapped({ account_id, tier, contact_ids, dm_contact_ids,
  //     champion_contact_ids, influencer_contact_ids, contacts_found, verified_email_count,
  //     stakeholder_map }, ctx);

  // Placeholder so the handler references both publish paths and stays type-safe.
  // TODO(owner): replace with one publish per processed account from the real run.
  void publishContactsMapped;
  void publishContactsSourcingFailed;
  void ctx;
}
