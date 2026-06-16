/**
 * Worker runner — `npm run worker`.
 *
 * Registers every engine's BullMQ subscriptions in one process so events flow
 * through the pipeline. In MVP this single process hosts all 11 engines' workers
 * (ADR-012); at scale, any engine can run its own worker process unchanged.
 *
 * Never import this from a web request — engines are wired here, not in routes.
 */

// Load .env (tsx doesn't auto-load it; Next.js loads it for the web process itself).
import 'dotenv/config';
import { engines } from '../lib/engines/registry';
import { registeredWorkers } from '../lib/events';

function log(msg: string, extra: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ level: 'info', msg, ...extra }));
}

async function main() {
  for (const engine of engines) {
    engine.register();
    log('engine registered', { engine: engine.slug, consumes: engine.consumes });
  }
  log('workers started', { engineCount: engines.length });

  const shutdown = async (signal: string) => {
    log('shutting down workers', { signal });
    await Promise.all(registeredWorkers().map((w) => w.close()));
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

void main();
