/**
 * Event handlers for the TAL Manager engine (#05).
 *
 * One async handler per CONSUMED event. Each handler:
 *   1. validates the payload (validation.ts),
 *   2. runs the core logic (service.ts) — stubbed for now,
 *   3. verifies the task-completion check, then publishes the success event
 *      (publisher.ts). Verify-before-publish (ADR-003).
 *
 * Consumes (catalog source of truth):
 *   - accounts.scored  → handleAccountsScored
 */

import type { EventEnvelope } from '../../events';
import { validateAccountsScoredPayload } from './validation';
import { publishTalFinalized } from './publisher';

/**
 * Trigger: Scoring Engine (04) finished scoring/tiering accounts.
 * Builds the official TAL, applies suppression, snapshots an immutable version,
 * writes CRM properties/lists (via Engine 10), then publishes `tal.finalized`.
 */
export async function handleAccountsScored(
  event: EventEnvelope<'accounts.scored'>,
): Promise<void> {
  validateAccountsScoredPayload(event.payload);

  // TODO(owner): core logic — orchestrate the step-by-step job via service.ts:
  //   1. loadScoredList(workspaceId, payload)
  //   2. applySuppression(workspaceId, accounts)
  //   3. createTalVersion(workspaceId, activeAccounts)
  //   4. resolveReviewStatus(workspaceId, talId)
  //   5. writeCrmCompanyProperties(workspaceId, activeAccounts)   // via Engine 10
  //   6. createActiveLists(workspaceId, talId)
  //   7. queueLinkedInAudienceSync(workspaceId, talId)            // v2
  // Then build CompletionCheckInput and run completionCheck(...) BEFORE publishing.
  // If completionCheck().ok is false, publish an error event instead (see README).

  const ctx = { workspaceId: event.workspace_id, correlationId: event.correlation_id };

  // TODO(owner): replace this placeholder payload with values from the real run.
  await publishTalFinalized(
    {
      tal_id: '',
      version: 0,
      version_number: 0,
      account_count: 0,
      tier1_count: 0,
      tier2_count: 0,
      tier3_count: 0,
      status: 'pending',
      review_status: 'unreviewed',
      suppressed_count: 0,
      finalized_at: event.timestamp,
    },
    ctx,
  );
}
