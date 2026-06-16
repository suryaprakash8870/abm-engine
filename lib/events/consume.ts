/**
 * subscribeToEvent — the ONLY way an engine reacts to an event.
 *
 * Each subscription is a BullMQ Worker on that event's queue. The base wrapper:
 *  - validates the envelope before handing it to the engine's handler,
 *  - tags structured logs with engine + correlation_id,
 *  - lets BullMQ handle retries; exhausted jobs land in the dead-letter queue.
 *
 * Workers are started by `npm run worker` (see workers/index.ts), never inside a
 * web request.
 */

import { Worker, type Job } from 'bullmq';
import { getRedisConnection } from '../clients/redis';
import { isValidEnvelope } from './envelope';
import { sendToDeadLetter } from './dead-letter';
import { eventQueueName, type EngineSlug } from './catalog';
import type { EventEnvelope, EventName } from './types';

export type EventHandler<T extends EventName> = (event: EventEnvelope<T>) => Promise<void>;

export interface SubscribeOptions {
  /** Which engine owns this subscription — used for logging + health. */
  engine: EngineSlug;
  /** Max concurrent jobs for this worker. Default 5. */
  concurrency?: number;
}

const workers: Worker[] = [];

export function subscribeToEvent<T extends EventName>(
  type: T,
  handler: EventHandler<T>,
  opts: SubscribeOptions,
): Worker {
  const worker = new Worker(
    eventQueueName(type, opts.engine),
    async (job: Job) => {
      const data = job.data as unknown;
      if (!isValidEnvelope(data)) {
        throw new Error(`[${opts.engine}] invalid envelope on ${type}: missing required fields`);
      }
      const envelope = data as EventEnvelope<T>;
      log(opts.engine, envelope, 'processing');
      await handler(envelope);
      log(opts.engine, envelope, 'processed');
    },
    { connection: getRedisConnection(), concurrency: opts.concurrency ?? 5 },
  );

  worker.on('failed', (job, err) => {
    if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
      void sendToDeadLetter(type, job.data, err, opts.engine);
    }
  });

  workers.push(worker);
  return worker;
}

/** All workers registered this process — used for graceful shutdown. */
export function registeredWorkers(): Worker[] {
  return workers;
}

function log(engine: EngineSlug, envelope: EventEnvelope, level: string) {
  // Structured JSON logging (conventions.md): one line, machine-parseable.
  console.log(
    JSON.stringify({
      engine,
      event: envelope.type,
      workspace_id: envelope.workspace_id,
      correlation_id: envelope.correlation_id,
      level,
    }),
  );
}
