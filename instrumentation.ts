/**
 * Next.js instrumentation — runs once when the server process boots.
 *
 * On the free Render tier there is no separate BullMQ worker service (Render has
 * no free worker plan). When RUN_WORKER_IN_WEB=true we boot the engine consumers
 * INSIDE the web process so the event pipeline still flows. The dedicated
 * `npm run worker` process (workers/index.ts) remains the right setup on paid
 * plans — this is the single-service fallback.
 *
 * IMPORTANT: the dynamic import MUST sit inside the `NEXT_RUNTIME === 'nodejs'`
 * check. Next compiles this file for BOTH the node and edge runtimes; webpack
 * replaces process.env.NEXT_RUNTIME with a literal per build, so in the edge
 * build this branch is dead code and the node-only deps (ioredis, crypto) are
 * stripped. An early `return` would NOT achieve that and the edge build fails.
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.RUN_WORKER_IN_WEB === 'true') {
    await import('./lib/engines/boot-workers');
  }
}
