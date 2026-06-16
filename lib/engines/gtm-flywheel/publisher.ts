/**
 * Engine 11 — GTM Flywheel · publishers.
 *
 * One thin, strongly-typed function per PUBLISHED event. Each is a wrapper over
 * `publishEvent` so call-sites never construct the envelope themselves and never
 * touch Redis directly (conventions.md). Publish ONLY after the task-completion
 * check passes (ADR-003); on failure call `publishFlywheelError` instead.
 *
 * Published events (catalog): flywheel.metrics_updated, icp.refresh_recommended,
 * flywheel.error.
 */

import {
  publishEvent,
  type FlywheelErrorPayload,
  type FlywheelMetricsUpdatedPayload,
  type IcpRefreshRecommendedPayload,
} from '../../events';

export interface PublishCtx {
  workspaceId: string;
  correlationId?: string;
}

/** Emitted daily or on significant change once metrics are recomputed. */
export async function publishFlywheelMetricsUpdated(
  payload: FlywheelMetricsUpdatedPayload,
  ctx: PublishCtx,
): Promise<void> {
  await publishEvent('flywheel.metrics_updated', payload, ctx);
}

/** Emitted after every 5th new Closed Won — closes the learning loop to ICP (01). */
export async function publishIcpRefreshRecommended(
  payload: IcpRefreshRecommendedPayload,
  ctx: PublishCtx,
): Promise<void> {
  await publishEvent('icp.refresh_recommended', payload, ctx);
}

/** Emitted when a task-completion check fails — never report a half-done job as success. */
export async function publishFlywheelError(
  payload: FlywheelErrorPayload,
  ctx: PublishCtx,
): Promise<void> {
  await publishEvent('flywheel.error', payload, ctx);
}
