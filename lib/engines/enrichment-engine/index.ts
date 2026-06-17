/**
 * Engine 03 — Enrichment Engine.
 *
 * The EngineModule wiring: declares its consumes/publishes from the frozen
 * catalog, wires BullMQ subscriptions in `register()`, and exposes a best-effort
 * `health()` probe for GET /api/v1/enrichment-engine/health.
 *
 * @see ../../../docs/engines/engine-03-enrichment-engine.md
 */

import { consumedBy, publishedBy } from '../../events';
import type { EngineModule, HealthStatus } from '../contract';
import { subscribeToEvent } from '../../events';
import { prisma } from '../../db/client';
import { pingRedis } from '../../clients/redis';
import { handleTamSearchCompleted, handleIcpCreated } from './handlers';
import { startEnrichmentWorker } from './enrich-queue';

const SLUG = 'enrichment-engine' as const;
const VERSION = '0.1.0';

export const engine = {
  slug: SLUG,
  consumes: consumedBy(SLUG),
  publishes: publishedBy(SLUG),

  /**
   * Wire each consumed event to its handler. Called by the worker runner
   * (`npm run worker`), never inside a web request.
   *
   * This engine IS event-triggered: `tam.search_completed` starts the pipeline,
   * and `icp.created` keeps a local ICP snapshot for qualification context.
   */
  register(): void {
    subscribeToEvent('tam.search_completed', handleTamSearchCompleted, { engine: SLUG });
    subscribeToEvent('icp.created', handleIcpCreated, { engine: SLUG });
    startEnrichmentWorker();
  },

  /**
   * Best-effort liveness probe. Pings Postgres and Redis inside try/catch so the
   * endpoint always returns a HealthStatus rather than throwing.
   */
  async health(): Promise<HealthStatus> {
    let db_connected = false;
    let queue_connected = false;

    try {
      await prisma.$queryRaw`SELECT 1`;
      db_connected = true;
    } catch {
      db_connected = false;
    }

    try {
      queue_connected = await pingRedis();
    } catch {
      queue_connected = false;
    }

    const status: HealthStatus['status'] =
      db_connected && queue_connected ? 'ok' : db_connected || queue_connected ? 'degraded' : 'down';

    return {
      status,
      version: VERSION,
      db_connected,
      queue_connected,
      last_event_processed_at: null, // TODO(owner): surface from enrichment_jobs/worker state.
    };
  },
} satisfies EngineModule;

export default engine;
