import 'dotenv/config';
import { Queue } from 'bullmq';
import { getRedisConnection } from '../lib/clients/redis';

async function main() {
  const conn = getRedisConnection();

  // Discover every BullMQ queue from its Redis keys. BullMQ namespaces keys as
  // `bull:<queueName>:<...>`, so the distinct middle segment is the queue name.
  const keys: string[] = [];
  let cursor = '0';
  do {
    const [next, batch] = await conn.scan(cursor, 'MATCH', 'bull:*', 'COUNT', 1000);
    cursor = next;
    keys.push(...batch);
  } while (cursor !== '0');

  const queueNames = new Set<string>();
  for (const k of keys) {
    const parts = k.split(':'); // bull : <name> : <rest...>
    if (parts.length >= 3 && parts[0] === 'bull') queueNames.add(parts[1]);
  }

  if (queueNames.size === 0) {
    console.log('No BullMQ queues found in Redis — already clean.');
    await conn.quit();
    return;
  }

  let totalWaiting = 0, totalActive = 0, totalDelayed = 0, totalFailed = 0, totalCompleted = 0;
  const perQueue: Array<Record<string, unknown>> = [];
  for (const name of [...queueNames].sort()) {
    const q = new Queue(name, { connection: conn });
    const counts = await q.getJobCounts('waiting', 'active', 'delayed', 'failed', 'completed', 'paused');
    const nonZero = Object.values(counts).some((v) => (v as number) > 0);
    if (nonZero) perQueue.push({ name, ...counts });
    totalWaiting += counts.waiting ?? 0;
    totalActive += counts.active ?? 0;
    totalDelayed += counts.delayed ?? 0;
    totalFailed += counts.failed ?? 0;
    totalCompleted += counts.completed ?? 0;
    await q.obliterate({ force: true });
    await q.close();
  }

  console.log('QUEUES_FOUND:', queueNames.size);
  console.log('BEFORE_TOTALS:', JSON.stringify({
    waiting: totalWaiting, active: totalActive, delayed: totalDelayed,
    failed: totalFailed, completed: totalCompleted,
  }));
  console.log('NON_EMPTY_QUEUES:', JSON.stringify(perQueue, null, 0));

  // Verify clean.
  let remaining = 0;
  let cur = '0';
  do {
    const [next, batch] = await conn.scan(cur, 'MATCH', 'bull:*', 'COUNT', 1000);
    cur = next;
    remaining += batch.length;
  } while (cur !== '0');
  console.log('REMAINING_BULL_KEYS_AFTER_OBLITERATE:', remaining);

  await conn.quit();
}

main().catch((e) => { console.error('ERR', e); process.exit(1); });
