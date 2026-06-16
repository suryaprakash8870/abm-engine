/**
 * publishEvent — the ONLY way an engine emits an event.
 *
 * Engines must never talk to Redis/BullMQ directly (conventions.md). They call
 * publishEvent() AFTER their task-completion check passes (ADR-003).
 *
 * FAN-OUT: the event is enqueued once per subscribing engine (from the catalog's
 * consumedBy), each on its own queue, so every subscriber receives a copy. An event
 * with no consumers is a no-op on the bus (its error events still flow to the
 * dead-letter inspector via the consumer side).
 */

import { Queue } from 'bullmq';
import { getRedisConnection } from '../clients/redis';
import { consumersOf, eventQueueName, type EngineSlug } from './catalog';
import { makeEnvelope, type PublishContext } from './envelope';
import { recordIfCapturing } from './test-harness';
import type { EventName, EventPayloads } from './types';

const queues = new Map<string, Queue>();

export function eventQueue(event: EventName, engine: EngineSlug): Queue {
  const name = eventQueueName(event, engine);
  let q = queues.get(name);
  if (!q) {
    q = new Queue(name, {
      connection: getRedisConnection(),
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: 1000,
        removeOnFail: false, // keep failures so the dead-letter inspector can see them
      },
    });
    queues.set(name, q);
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
  const consumers: EngineSlug[] = consumersOf(type);
  await Promise.all(consumers.map((engine) => eventQueue(type, engine).add(type, envelope)));
}
