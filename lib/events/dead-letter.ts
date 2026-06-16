/**
 * Dead-letter queue — where events go after all retries are exhausted
 * (glossary.md, conventions.md). Inspect + manually replay from here.
 */

import { Queue } from 'bullmq';
import { getRedisConnection } from '../clients/redis';
import type { EngineSlug } from './catalog';
import type { EventName } from './types';

let dlq: Queue | null = null;

function deadLetterQueue(): Queue {
  if (!dlq) {
    dlq = new Queue('dead-letter', { connection: getRedisConnection() });
  }
  return dlq;
}

export async function sendToDeadLetter(
  event: EventName,
  data: unknown,
  error: Error,
  engine: EngineSlug,
): Promise<void> {
  await deadLetterQueue().add('dead-letter', {
    event,
    engine,
    error: { message: error.message, stack: error.stack },
    data,
    failed_at: new Date().toISOString(),
  });
  console.error(
    JSON.stringify({ engine, event, level: 'dead_letter', error: error.message }),
  );
}
