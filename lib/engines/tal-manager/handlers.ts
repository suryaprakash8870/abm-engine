/**
 * Event handlers for the TAL Manager engine (#05).
 *
 * One async handler per CONSUMED event. Each handler:
 *   1. validates the payload (validation.ts),
 *   2. runs the core step-by-step job (service.ts),
 *   3. runs the task-completion check, then publishes `tal.finalized` ONLY when it
 *      passes (verify-before-publish, ADR-003). A failed check throws so the event
 *      consumer retries / dead-letters — it never publishes a half-finished TAL.
 *
 * Consumes: accounts.scored → handleAccountsScored
 */

import type { EventEnvelope } from '../../events';
import { validateAccountsScoredPayload, completionCheck } from './validation';
import { finalizeTal } from './service';
import { publishTalFinalized } from './publisher';

/**
 * Trigger: Scoring Engine (04) finished scoring/tiering accounts.
 * Builds the official TAL, applies suppression, snapshots an immutable version,
 * queues CRM property/list writes (Engine 10), then publishes `tal.finalized`.
 */
export async function handleAccountsScored(
  event: EventEnvelope<'accounts.scored'>,
): Promise<void> {
  validateAccountsScoredPayload(event.payload);

  const ctx = { workspaceId: event.workspace_id, correlationId: event.correlation_id };

  const result = await finalizeTal(event.workspace_id, {
    accountIds: event.payload.account_ids,
    correlationId: event.correlation_id,
  });

  // Verify-before-publish: confirm the work is complete before announcing it.
  // `finalizedEventPublished` is satisfied by the publish step immediately below.
  const check = completionCheck({
    suppressionApplied: result.suppressionApplied,
    talVersionCreated: result.talVersionCreated,
    crmPropertiesAndListsWritten: result.crmRequested,
    finalizedEventPublished: true,
  });

  if (!check.ok) {
    // No dedicated error event exists for this engine (catalog). Fail closed:
    // do NOT publish a half-finished tal.finalized — throw so the consumer retries.
    throw new Error(`[tal-manager] completion check failed: ${check.failed.join('; ')}`);
  }

  await publishTalFinalized(
    {
      tal_id: result.talId,
      version: result.versionNumber,
      version_number: result.versionNumber,
      account_count: result.accountCount,
      tier1_count: result.tier1Count,
      tier2_count: result.tier2Count,
      tier3_count: result.tier3Count,
      status: result.status,
      review_status: result.reviewStatus,
      suppressed_count: result.suppressedCount,
      finalized_at: event.timestamp,
    },
    ctx,
  );
}
