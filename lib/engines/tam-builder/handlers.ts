/**
 * Event handlers for the TAM Builder (engine 02).
 *
 * One async handler per CONSUMED event. The engine consumes exactly one trigger:
 *   - icp.created → handleIcpCreated
 *
 * Handler shape (verify-before-publish, ADR-003):
 *   1. validate the incoming payload (validation.ts),
 *   2. run the core job (service.ts),
 *   3. run the task-completion check,
 *   4. publish `tam.search_completed` ONLY if it passes, else `tam.search_failed`.
 *
 * This is a compiling stub: the orchestration is sketched, the heavy lifting is
 * left as TODO(owner). See docs/engines/engine-02-tam-builder.md.
 */

import type { EventEnvelope } from '../../events';
import { validateIcpCreatedPayload } from './validation';
import { publishTamSearchCompleted, publishTamSearchFailed } from './publisher';

/**
 * Trigger: `icp.created`. Builds the raw TAM list for the new ICP and publishes
 * `tam.search_completed` (or `tam.search_failed` on any failed completion check).
 */
export async function handleIcpCreated(
  event: EventEnvelope<'icp.created'>,
): Promise<void> {
  const ctx = {
    workspaceId: event.workspace_id,
    correlationId: event.correlation_id,
  };
  // Captured up front: the false branch of the type guard narrows event.payload
  // to `never`, so read the id here while it is still typed.
  const icpId = (event.payload as { icp_id?: unknown }).icp_id;

  // 1. Validate the incoming payload before doing any work (conventions.md).
  if (!validateIcpCreatedPayload(event.payload)) {
    await publishTamSearchFailed(
      {
        job_id: '',
        icp_id: typeof icpId === 'string' ? icpId : '',
        error_code: 'invalid_payload',
        error_message: 'icp.created payload failed structural validation',
        last_processed_page: 0,
        processed: 0,
      },
      ctx,
    );
    return;
  }

  // TODO(owner): core logic — run the step-by-step job from service.ts:
  //   createBuildJob → extractFirmographics → buildSearchParamSets →
  //   runApolloSearch (paginate) → mergeAndDedupe → mergeUploadedAccounts →
  //   persistRawAccounts → summariseSources → streamProgress.
  // Then run completionCheck(...) and branch:
  //   - if ok  → publishTamSearchCompleted({ job_id, icp_id, account_ids, total_found, account_limit, source_breakdown }, ctx)
  //   - if !ok → publishTamSearchFailed({ job_id, icp_id, error_code, error_message, last_processed_page, processed }, ctx)
  //
  // The placeholder publish below keeps the handler compiling and documents the
  // success contract; replace it with the real branch once the job is wired.
  void publishTamSearchCompleted;
}
