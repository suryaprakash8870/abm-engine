/**
 * Node-only worker boot — imported lazily by instrumentation.ts ONLY in the
 * nodejs runtime. Kept in its own file so the heavy server-only deps (ioredis,
 * bullmq, node:crypto) never enter the edge bundle.
 *
 * Registers every engine's BullMQ consumers in the web process (free-tier
 * fallback for the dedicated `npm run worker`). See instrumentation.ts.
 */

import { engines } from './registry';

for (const engine of engines) {
  engine.register();
  console.log(
    JSON.stringify({ level: 'info', msg: 'engine registered (in-web)', engine: engine.slug }),
  );
}
console.log(
  JSON.stringify({ level: 'info', msg: 'in-web workers started', engineCount: engines.length }),
);
