/**
 * Handlers — one async handler per CONSUMED event.
 *
 * Engine 03 consumes:
 *   - `tam.search_completed` → enrich + qualify the accounts, then publish accounts.enriched
 *   - `icp.created`          → store a local ICP snapshot for qualification context
 *
 * @see ../../../docs/engines/engine-03-enrichment-engine.md
 */

import type { EventEnvelope } from '../../events';
import { validateIcpCreated, validateTamSearchCompleted } from './validation';
import { storeIcpSnapshot } from './service';
import { startEnrichment } from './enrich-queue';

/** Trigger: `tam.search_completed`. Enqueue enrichment for the accounts TAM found. */
export async function handleTamSearchCompleted(event: EventEnvelope<'tam.search_completed'>): Promise<void> {
  const validation = validateTamSearchCompleted(event);
  if (!validation.ok) {
    throw new Error(`[enrichment-engine] invalid tam.search_completed payload: ${validation.errors.join('; ')}`);
  }
  const accounts = event.payload.accounts ?? [];
  if (accounts.length === 0) return; // nothing to enrich

  await startEnrichment({
    workspaceId: event.workspace_id,
    sourceJobId: event.payload.job_id,
    icpId: event.payload.icp_id,
    accounts,
    correlationId: event.correlation_id,
  });
}

/** Cache the ICP locally so qualification has fresh context without a cross-engine query. */
export async function handleIcpCreated(event: EventEnvelope<'icp.created'>): Promise<void> {
  const validation = validateIcpCreated(event);
  if (!validation.ok) {
    throw new Error(`[enrichment-engine] invalid icp.created payload: ${validation.errors.join('; ')}`);
  }
  await storeIcpSnapshot(event.workspace_id, event.payload);
}
