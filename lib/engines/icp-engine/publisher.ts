/**
 * Publishers for the ICP Engine.
 *
 * One thin, strongly-typed function per PUBLISHED event:
 *   - icp.created   (success — a brand new ICP)
 *   - icp.updated   (success — an existing ICP re-versioned)
 *   - icp.error     (failure — emitted instead of a success event, ADR-003)
 *
 * Each just wraps publishEvent(); the success path is only called AFTER the
 * task-completion check passes (see validation.completionCheck).
 */

import { publishEvent } from '../../events';
import type {
  IcpCreatedPayload,
  IcpUpdatedPayload,
  IcpErrorPayload,
} from '../../events';

export interface PublishCtx {
  workspaceId: string;
  correlationId?: string;
}

/** Publish `icp.created` — a new ICP definition is ready for downstream engines. */
export async function publishIcpCreated(
  payload: IcpCreatedPayload,
  ctx: PublishCtx,
): Promise<void> {
  await publishEvent('icp.created', payload, ctx);
}

/** Publish `icp.updated` — an existing ICP was re-versioned (edit or flywheel feedback). */
export async function publishIcpUpdated(
  payload: IcpUpdatedPayload,
  ctx: PublishCtx,
): Promise<void> {
  await publishEvent('icp.updated', payload, ctx);
}

/** Publish `icp.error` — the build/refresh failed; emit this instead of a success event. */
export async function publishIcpError(
  payload: IcpErrorPayload,
  ctx: PublishCtx,
): Promise<void> {
  await publishEvent('icp.error', payload, ctx);
}
