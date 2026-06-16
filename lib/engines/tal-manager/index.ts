/**
 * Engine #05 — TAL Manager.
 *
 * Build and maintain the official Target Account List: apply suppression,
 * snapshot immutable versions, and push the final list to CRM + ad platforms.
 *
 *   Consumes: accounts.scored   (from Scoring Engine 04)
 *   Publishes: tal.finalized    (to Contact Engine 06 + CRM Sync 10)
 *
 * The EngineModule shape is the swappable-unit contract (ADR-012). The single
 * source of truth for consumes/publishes is the catalog (consumedBy/publishedBy);
 * `assertMatchesCatalog` in the test guards against drift.
 */

import {
  EVENTS,
  consumedBy,
  publishedBy,
  subscribeToEvent,
  type EngineSlug,
} from '../../events';
import type { EngineModule, HealthStatus } from '../contract';
import { prisma } from '../../db/client';
import { pingRedis } from '../../clients/redis';
import { handleAccountsScored } from './handlers';

const SLUG: EngineSlug = 'tal-manager';
const VERSION = '0.1.0';

export const engine = {
  slug: SLUG,
  consumes: consumedBy(SLUG),
  publishes: publishedBy(SLUG),

  /**
   * Wire BullMQ subscriptions: each consumed event → its handler.
   * Called by the worker runner (never inside a web request).
   */
  register(): void {
    subscribeToEvent(EVENTS.ACCOUNTS_SCORED, handleAccountsScored, { engine: SLUG });
  },

  /**
   * Best-effort health probe backing GET /api/v1/tal-manager/health.
   * Pings Postgres and Redis inside try/catch so a probe never throws.
   */
  async health(): Promise<HealthStatus> {
    let dbConnected = false;
    let queueConnected = false;

    try {
      await prisma.$queryRaw`SELECT 1`;
      dbConnected = true;
    } catch {
      dbConnected = false;
    }

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
      // TODO(owner): track the last processed event timestamp (e.g. in Redis).
      last_event_processed_at: null,
    };
  },
} satisfies EngineModule;

export default engine;
