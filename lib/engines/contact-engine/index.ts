/**
 * Engine #06 — Contact Engine.
 *
 * Source and map buying committees: find the decision-maker, champion, and
 * influencer for each Tier-1/2 account, verify emails, assign stakeholder roles
 * via Claude Haiku, dedupe against the CRM, and publish a stakeholder map per
 * account.
 *
 *   Consumes: tal.finalized                              (from TAL Manager / 05)
 *   Publishes: contacts.mapped, contacts.sourcing_failed (to Signal 07 + CRM Sync 10)
 *
 * The EngineModule shape is the swappable-unit contract (ADR-012). The single
 * source of truth for consumes/publishes is the catalog (consumedBy/publishedBy);
 * `assertMatchesCatalog` in the test guards against drift.
 *
 * @see ../../../docs/engines/engine-06-contact-engine.md
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
import { handleTalFinalized } from './handlers';
import { startContactWorker } from './contact-queue';

const SLUG: EngineSlug = 'contact-engine';
const VERSION = '0.1.0';

export const engine = {
  slug: SLUG,
  consumes: consumedBy(SLUG),
  publishes: publishedBy(SLUG),

  /**
   * Wire BullMQ subscriptions: each consumed event → its handler.
   * `consumedBy('contact-engine')` is non-empty (`tal.finalized`), so we subscribe
   * it here. Called by the worker runner, never inside a web request.
   */
  register(): void {
    subscribeToEvent(EVENTS.TAL_FINALIZED, handleTalFinalized, { engine: SLUG });
    startContactWorker();
  },

  /**
   * Best-effort health probe backing GET /api/v1/contact-engine/health.
   * Pings Postgres (trivial query) and Redis inside try/catch so a probe never throws.
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
      // TODO(owner): track the last processed event timestamp (e.g. in Redis).
      last_event_processed_at: null,
    };
  },
} satisfies EngineModule;

export default engine;
