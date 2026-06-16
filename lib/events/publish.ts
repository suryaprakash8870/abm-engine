/**
 * publishEvent — the ONLY way an engine emits an event.
 *
 * Engines must never talk to Redis/BullMQ directly (conventions.md). They call
 * publishEvent() AFTER their task-completion check passes (ADR-003).
 *
 * Implementation: one BullMQ queue per event name on the shared Redis connection.
 * A queue-per-event keeps consumers cleanly separated and lets each scale alone.
 */

import { Queue } from 'bullmq';
import { getRedisConnection } from '../clients/redis';
import { makeEnvelope, type PublishContext } from './envelope';
import { recordIfCapturing } from './test-harness';
import type { EventName, EventPayloads } from './types';

const queues = new Map<EventName, Queue>();

export function eventQueue(event: EventName): Queue {
  let q = queues.get(event);
  if (!q) {
    q = new Queue(`event:${event}`, {
      connection: getRedisConnection(),
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: 1000,
        removeOnFail: false, // keep failures so the dead-letter inspector can see them
      },
    });
    queues.set(event, q);
  }
  return q;
}

export async function publishEvent<T extends EventName>(
  type: T,
  payload: EventPayloads[T],
  ctx: PublishContext,
): Promise<void> {
  const envelope = makeEnvelope(type, payload, ctx);
  // In integration tests the harness captures the event in-memory and skips Redis.
  if (recordIfCapturing(envelope)) return;
  await eventQueue(type).add(type, envelope, { jobId: undefined });
}
