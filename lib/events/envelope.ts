/**
 * Envelope helpers — build and validate the standard event wrapper.
 * Every event on the bus MUST go through `makeEnvelope` so that workspace_id,
 * correlation_id, and timestamp are always present (ADR-002, ADR-004).
 */

import { randomUUID } from 'node:crypto';
import type { EventEnvelope, EventName, EventPayloads, CorrelationId } from './types';

/** Generate a new correlation id at the start of a pipeline run. */
export function newCorrelationId(): CorrelationId {
  return `corr_${randomUUID()}`;
}

export interface PublishContext {
  workspaceId: string;
  /** Pass through the upstream correlation id; omit only at a pipeline's origin. */
  correlationId?: CorrelationId;
}

export function makeEnvelope<T extends EventName>(
  type: T,
  payload: EventPayloads[T],
  ctx: PublishContext,
): EventEnvelope<T> {
  return {
    type,
    payload,
    workspace_id: ctx.workspaceId,
    correlation_id: ctx.correlationId ?? newCorrelationId(),
    timestamp: new Date().toISOString(),
  };
}

/** Cheap structural guard run by every consumer before processing (conventions.md). */
export function isValidEnvelope(value: unknown): value is EventEnvelope {
  if (typeof value !== 'object' || value === null) return false;
  const e = value as Record<string, unknown>;
  return (
    typeof e.type === 'string' &&
    typeof e.workspace_id === 'string' &&
    e.workspace_id.length > 0 &&
    typeof e.correlation_id === 'string' &&
    typeof e.timestamp === 'string' &&
    typeof e.payload === 'object' &&
    e.payload !== null
  );
}
