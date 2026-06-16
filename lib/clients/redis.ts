/**
 * Redis connections.
 *
 *  - BullMQ (the event bus + job queues) needs a real TCP connection via ioredis.
 *    Upstash exposes one as a `rediss://` URL — put it in REDIS_URL.
 *  - The dedup / rate-limit caches can use Upstash's REST client (@upstash/redis)
 *    via UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN.
 *
 * BullMQ requires `maxRetriesPerRequest: null` on its connection. A side effect:
 * a raw `.ping()` while Redis is unreachable would queue forever, so health checks
 * must use the time-boxed `pingRedis()` below, never a bare `.ping()`.
 */

import IORedis, { type Redis } from 'ioredis';

let connection: Redis | null = null;
let lastErrorLogged = '';

/** Shared ioredis connection for BullMQ producers/consumers. */
export function getRedisConnection(): Redis {
  if (connection) return connection;
  const url = process.env.REDIS_URL;
  if (!url) {
    throw new Error(
      'REDIS_URL is not set. BullMQ needs a TCP Redis URL (rediss://...). ' +
        'Upstash provides this under Database → Connect → ioredis.',
    );
  }
  connection = new IORedis(url, {
    maxRetriesPerRequest: null, // required by BullMQ
    connectTimeout: 10_000,
    // Keep reconnecting forever (BullMQ needs to recover when Redis returns),
    // but cap the backoff so we don't thrash.
    retryStrategy: (times) => Math.min(times * 500, 5_000),
  });
  // An ioredis instance with no 'error' listener emits "Unhandled error event"
  // and can crash the process. Attach one and log each DISTINCT error once.
  connection.on('error', (err: Error) => {
    if (err.message !== lastErrorLogged) {
      lastErrorLogged = err.message;
      console.warn(
        JSON.stringify({ level: 'warn', component: 'redis', msg: 'connection error', error: err.message }),
      );
    }
  });
  connection.on('ready', () => {
    lastErrorLogged = '';
  });
  return connection;
}

/**
 * Time-boxed health ping. Returns true only if Redis answers PONG within
 * `timeoutMs`. Safe to call from health endpoints — never hangs, even when Redis
 * is down (a bare `.ping()` on the BullMQ connection would).
 */
export async function pingRedis(timeoutMs = 1_500): Promise<boolean> {
  try {
    const pong = await Promise.race<string>([
      getRedisConnection().ping(),
      new Promise<string>((resolve) => setTimeout(() => resolve('TIMEOUT'), timeoutMs)),
    ]);
    return pong === 'PONG';
  } catch {
    return false;
  }
}
