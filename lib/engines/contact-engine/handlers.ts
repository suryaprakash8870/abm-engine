/**
 * Event handlers for the Contact Engine (#06).
 *
 * tal.finalized → validate → enqueue one async sourcing job per Tier-1/2 account
 * (never run Apollo/verify/role-assignment inline). Each job publishes
 * contacts.mapped or contacts.sourcing_failed for its account after the
 * completion check passes (verify-before-publish, ADR-003).
 *
 * Consumes (catalog source of truth):
 *   - tal.finalized  → handleTalFinalized
 *
 * @see ../../../docs/engines/engine-06-contact-engine.md
 */

import type { EventEnvelope } from '../../events';
import { validateTalFinalizedPayload } from './validation';
import { loadAccountsToProcess } from './service';
import { enqueueSourcingJob } from './contact-queue';

/**
 * Trigger: TAL Manager (05) finalised the tiered list. Fan out a per-account
 * sourcing job for every Tier-1/2 account (Tier 1 first). Tier 3 is not contacted.
 */
export async function handleTalFinalized(
  event: EventEnvelope<'tal.finalized'>,
): Promise<void> {
  validateTalFinalizedPayload(event.payload);

  const accounts = await loadAccountsToProcess(event.workspace_id);
  if (accounts.length === 0) return;

  for (const a of accounts) {
    await enqueueSourcingJob({
      workspaceId: event.workspace_id,
      accountId: a.accountId,
      tier: a.tier,
      domain: a.domain,
      name: a.name,
      // Per-account correlation id derived from the source event so a retry of the
      // same tal.finalized dedups to the same sourcing jobs.
      correlationId: `${event.correlation_id}:${a.accountId}`,
    });
  }
}
