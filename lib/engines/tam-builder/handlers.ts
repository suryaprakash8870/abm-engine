/**
 * Event handlers for the TAM Builder (engine 02).
 *
 * Consumes exactly one trigger: `icp.created`. On a valid ICP it derives Apollo
 * filters from the firmographics and enqueues a TAM build (the heavy paginated
 * search runs in the build worker, never inline). This is the first forward link
 * in the pipeline: ICP → account list.
 *
 * Spec: ../../../docs/engines/engine-02-tam-builder.md
 */

import type { EventEnvelope } from '../../events';
import { validateIcpCreatedPayload } from './validation';
import { publishTamSearchFailed } from './publisher';
import { icpToFilters } from './service';
import { startTamBuild } from './build-queue';

/** Trigger: `icp.created`. Build the raw TAM list for the new ICP. */
export async function handleIcpCreated(event: EventEnvelope<'icp.created'>): Promise<void> {
  const ctx = { workspaceId: event.workspace_id, correlationId: event.correlation_id };

  if (!validateIcpCreatedPayload(event.payload)) {
    await publishTamSearchFailed(
      {
        job_id: '',
        icp_id: typeof (event.payload as { icp_id?: unknown })?.icp_id === 'string' ? (event.payload as { icp_id: string }).icp_id : '',
        error_code: 'invalid_payload',
        error_message: 'icp.created payload failed structural validation',
        last_processed_page: 0,
        processed: 0,
      },
      ctx,
    );
    return;
  }

  const filters = icpToFilters(event.payload);
  await startTamBuild({
    workspaceId: event.workspace_id,
    icpId: event.payload.icp_id,
    filters,
    // accountLimit omitted → uses TAM_ACCOUNT_LIMIT (or 1000). Keep small for real Apollo.
    correlationId: event.correlation_id,
  });
}
