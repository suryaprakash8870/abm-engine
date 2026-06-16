/**
 * Engine 09 — Demand Gen Orchestrator.
 *
 * "Execute the right play at the right time." Subscribes to Awareness Engine
 * triggers (account.stage_changed, account.hot), evaluates the play matrix,
 * checks suppression, fires the play, and publishes play.fired /
 * play.outcome_recorded.
 *
 * This module is the engine's `EngineModule` contract object: it declares its
 * consumed/published events (from the frozen catalog), wires its BullMQ
 * subscriptions in `register()`, and exposes a best-effort `health()` probe.
 */

import { consumedBy, publishedBy, subscribeToEvent } from '../../events';
import { prisma } from '../../db/client';
import { pingRedis } from '../../clients/redis';
import type { EngineModule, HealthStatus } from '../contract';
import { handleAccountStageChanged, handleAccountHot } from './handlers';

const SLUG = 'demand-gen-orchestrator' as const;

export const engine = {
  slug: SLUG,
  consumes: consumedBy(SLUG),
  publishes: publishedBy(SLUG),

  /**
   * Wire BullMQ subscriptions: each consumed event → its handler.
   * Called by the worker runner, never inside a web request.
   */
  register(): void {
    subscribeToEvent('account.stage_changed', handleAccountStageChanged, { engine: SLUG });
    subscribeToEvent('account.hot', handleAccountHot, { engine: SLUG });
  },

  /**
   * Best-effort health probe backing GET /api/v1/demand-gen-orchestrator/health.
   * Pings Postgres and Redis inside try/catch so the endpoint never throws.
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
      version: '0.1.0',
      db_connected,
      queue_connected,
      last_event_processed_at: null,
    };
  },
} satisfies EngineModule;

export default engine;
