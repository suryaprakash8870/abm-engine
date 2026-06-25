/**
 * Next.js instrumentation — runs once when the server process boots.
 *
 * On the free Render tier there is no separate BullMQ worker service (Render has
 * no free worker plan). When RUN_WORKER_IN_WEB=true we boot the engine consumers
 * INSIDE the web process so the event pipeline still flows. The dedicated
 * `npm run worker` process (workers/index.ts) remains the right setup on paid
 * plans — this is the single-service fallback.
 *
 * Guards:
 *   - nodejs runtime only (never the edge runtime — BullMQ/ioredis are node-only)
 *   - opt-in via RUN_WORKER_IN_WEB so local `next dev` + a separate worker don't
 *     double-register the same consumers.
 */

export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (process.env.RUN_WORKER_IN_WEB !== 'true') return;

  const { engines } = await import('./lib/engines/registry');

  for (const engine of engines) {
    engine.register();
    console.log(
      JSON.stringify({ level: 'info', msg: 'engine registered (in-web)', engine: engine.slug }),
    );
  }
  console.log(
    JSON.stringify({ level: 'info', msg: 'in-web workers started', engineCount: engines.length }),
  );
}
