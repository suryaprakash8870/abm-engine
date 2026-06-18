/**
 * Daily decay recalculation (engine 08, step 7).
 *
 * A BullMQ repeatable job at 00:00 UTC re-decays every account's score so stale
 * accounts cool off even without new signals. Idempotent + safe to retry (doc
 * failure-handling: "scores are stale but not wrong"). Started by the engine's
 * register() on the worker — never in a web request.
 */

import { Queue, Worker } from 'bullmq';
import { getRedisConnection } from '../../clients/redis';
import { newCorrelationId } from '../../events';
import { runDailyDecayRecalculation, workspacesWithAwareness } from './service';
import { publishAccountStageChanged } from './publisher';

const QUEUE_NAME = 'awareness.daily-decay';

let queue: Queue | null = null;
let worker: Worker | null = null;

export function startDailyDecayJob(): void {
  if (worker) return;
  queue = new Queue(QUEUE_NAME, { connection: getRedisConnection() });

  // One repeatable job, deduped by its repeat key — safe to (re)add on every boot.
  queue
    .add('daily-decay', {}, { repeat: { pattern: '0 0 * * *', tz: 'UTC' }, removeOnComplete: true, removeOnFail: 50 })
    .catch((e) => console.warn(JSON.stringify({ level: 'warn', component: 'awareness', msg: 'could not schedule daily decay', error: String(e) })));

  worker = new Worker(
    QUEUE_NAME,
    async () => {
      for (const ws of await workspacesWithAwareness()) {
        // Propagate decay-driven stage changes (cool-offs) downstream, same as the
        // signal-triggered path — otherwise CRM/Orchestrator keep a stale stage.
        const stageChanges = await runDailyDecayRecalculation(ws);
        for (const change of stageChanges) {
          await publishAccountStageChanged(change, { workspaceId: ws, correlationId: newCorrelationId() });
        }
      }
    },
    { connection: getRedisConnection(), concurrency: 1 },
  );
}
