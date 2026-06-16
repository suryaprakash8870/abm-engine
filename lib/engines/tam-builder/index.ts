/**
 * Engine 02 — TAM Builder.
 *
 * Sources every company in the world that matches an ICP. Triggered by
 * `icp.created`, it searches Apollo, paginates to the plan limit, dedupes by
 * domain, folds in any uploaded CSV, and publishes `tam.search_completed`
 * (or `tam.search_failed`). The Enrichment Engine (03) consumes the success event.
 *
 * This module is the engine's contract surface: declared events (from the frozen
 * catalog), BullMQ wiring in `register()`, and a `health()` probe for
 * GET /api/v1/tam-builder/health.
 *
 * See docs/engines/engine-02-tam-builder.md.
 */

import { consumedBy, publishedBy, subscribeToEvent } from '../../events';
import { prisma } from '../../db/client';
import { pingRedis } from '../../clients/redis';
import type { EngineModule, HealthStatus } from '../contract';
import { handleIcpCreated } from './handlers';

const SLUG = 'tam-builder' as const;
const VERSION = '0.1.0';

const engine = {
  slug: SLUG,
  consumes: consumedBy(SLUG),
  publishes: publishedBy(SLUG),

  /**
   * Wire BullMQ subscriptions. Called by the worker runner, never in a request.
   * TAM Builder consumes a single trigger — `icp.created` — routed to its handler.
   */
  register(): void {
    subscribeToEvent('icp.created', handleIcpCreated, { engine: SLUG });
  },

  /**
   * Best-effort health probe. Pings Postgres and Redis inside try/catch so the
   * endpoint always answers, degrading gracefully when a dependency is down.
   */
  async health(): Promise<HealthStatus> {
    let dbConnected = false;
    try {
      await prisma.$queryRaw`SELECT 1`;
      dbConnected = true;
    } catch {
      dbConnected = false;
    }

    let queueConnected = false;
    try {
      queueConnected = await pingRedis();
    } catch {
      queueConnected = false;
    }

    const status: HealthStatus['status'] =
      dbConnected && queueConnected ? 'ok' : dbConnected || queueConnected ? 'degraded' : 'down';

    return {
      status,
      version: VERSION,
      db_connected: dbConnected,
      queue_connected: queueConnected,
      // TODO(owner): track the timestamp of the last processed event (e.g. in Redis).
      last_event_processed_at: null,
    };
  },
} satisfies EngineModule;

export default engine;
export { engine };
