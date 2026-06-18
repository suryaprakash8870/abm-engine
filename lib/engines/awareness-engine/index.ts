/**
 * Engine 08 — Awareness Engine.
 *
 * Turns raw buying signals into a single awareness score per account. It applies
 * per-signal time-decay (old signals matter less), manages the five awareness
 * stages, detects "hot" jumps, and evaluates workspace routing rules that tell
 * sales reps when to act. Scoring + routing are deterministic (no LLM) so a rep
 * asking "why is this account at 67?" gets an auditable signal-history answer.
 *
 * Contract: see lib/engines/contract.ts. Catalog (source of truth for
 * consumes/publishes): lib/events/catalog.ts.
 */

import { consumedBy, publishedBy, subscribeToEvent } from '../../events';
import { prisma } from '../../db/client';
import { pingRedis } from '../../clients/redis';
import type { EngineModule, HealthStatus } from '../contract';
import { handleSignalReceived } from './handlers';
import { startDailyDecayJob } from './awareness-queue';

const SLUG = 'awareness-engine' as const;

const awarenessEngine = {
  slug: SLUG,
  consumes: consumedBy(SLUG),
  publishes: publishedBy(SLUG),

  /**
   * Wire each consumed event to its handler on a BullMQ worker.
   * Consumed (catalog): signal.received.
   *
   * NOTE: this engine ALSO has non-event triggers — the daily decay
   * recalculation runs from a BullMQ scheduled job (00:00 UTC), and the routing
   * rules CRUD + score feed arrive over HTTP under /api/v1/awareness/...; those
   * are wired by the scheduler / API routes, not here. register() only handles
   * the event-bus subscriptions.
   */
  register(): void {
    subscribeToEvent('signal.received', handleSignalReceived, { engine: SLUG });
    startDailyDecayJob();
  },

  /**
   * Best-effort health probe backing GET /api/v1/awareness-engine/health.
   * Pings Postgres + Redis inside try/catch so the probe never throws.
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
      version: '0.1.0',
      db_connected: dbConnected,
      queue_connected: queueConnected,
      last_event_processed_at: null, // TODO(owner): surface from awareness_scores.last_calculated_at.
    };
  },
} satisfies EngineModule;

export const engine = awarenessEngine;
export default awarenessEngine;
