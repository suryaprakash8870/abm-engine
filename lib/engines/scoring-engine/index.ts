/**
 * Engine 04 — Scoring Engine.
 *
 * The EngineModule wiring: declares its consumes/publishes from the frozen
 * catalog, wires BullMQ subscriptions in `register()`, and exposes a best-effort
 * `health()` probe for GET /api/v1/scoring-engine/health.
 *
 * Scores and tiers every qualified account against the ICP (0-100 → Tier 1/2/3),
 * then publishes `accounts.scored` (or `scoring.failed` on a failed completion
 * check, per ADR-003 verify-before-publish).
 *
 * @see ../../../docs/engines/engine-04-scoring-engine.md
 */

import { consumedBy, publishedBy } from '../../events';
import { subscribeToEvent } from '../../events';
import type { EngineModule, HealthStatus } from '../contract';
import { prisma } from '../../db/client';
import { pingRedis } from '../../clients/redis';
import { handleAccountsEnriched } from './handlers';

const SLUG = 'scoring-engine' as const;
const VERSION = '0.1.0';

export const engine = {
  slug: SLUG,
  consumes: consumedBy(SLUG),
  publishes: publishedBy(SLUG),

  /**
   * Wire each consumed event to its handler. Called by the worker runner
   * (`npm run worker`), never inside a web request.
   *
   * This engine IS event-triggered: `accounts.enriched` (from Enrichment, 03)
   * starts the scoring pipeline. Formula generation/editing additionally happens
   * via the HTTP routes under app/api/v1/scoring/*.
   */
  register(): void {
    subscribeToEvent('accounts.enriched', handleAccountsEnriched, { engine: SLUG });
  },

  /**
   * Best-effort liveness probe. Pings Postgres and Redis inside try/catch so the
   * endpoint always returns a HealthStatus rather than throwing.
   */
  async health(): Promise<HealthStatus> {
    let db_connected = false;
    let queue_connected = false;

    try {
      // Trivial round-trip to confirm the DB is reachable.
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
      last_event_processed_at: null, // TODO(owner): surface from account_scores/worker state.
    };
  },
} satisfies EngineModule;

export default engine;
