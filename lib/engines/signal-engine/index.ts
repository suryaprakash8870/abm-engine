/**
 * Engine 07 — Signal Engine
 *
 * Track all buying signals in real time. Always-on intelligence engine that
 * watches website visits, CRM/email webhooks, and scheduled 3rd-party polls,
 * resolves each signal to a TAL account, normalises it to a common schema,
 * deduplicates it (5-minute Redis window), and publishes it for the Awareness
 * Engine to score.
 *
 * Consumes: contacts.mapped     (from Contact Engine / 06 — used to attribute
 *                                signals to specific contacts on an account)
 * Publishes: signal.received    (consumed by Awareness Engine / 08)
 *
 * Most signal intake is via HTTP routes/webhooks (see app/api/v1/signals/* and
 * app/api/v1/webhooks/*), not the event bus — but `contacts.mapped` is consumed
 * so freshly-mapped contacts can be attributed to incoming signals.
 *
 * See docs/engines/engine-07-signal-engine.md
 */

import {
  consumedBy,
  publishedBy,
  subscribeToEvent,
  EVENTS,
} from '../../events';
import type { EngineModule, HealthStatus } from '../contract';
import { prisma } from '../../db/client';
import { pingRedis } from '../../clients/redis';
import { handleContactsMapped } from './handlers';

const SLUG = 'signal-engine' as const;
const VERSION = '0.1.0';

const signalEngine = {
  slug: SLUG,
  consumes: consumedBy(SLUG),
  publishes: publishedBy(SLUG),

  /**
   * Wire BullMQ subscriptions. The Signal Engine consumes `contacts.mapped`
   * (consumedBy('signal-engine') is non-empty), so we subscribe each consumed
   * event to its matching handler. Called by the worker runner, never in a
   * request.
   *
   * NOTE: the engine's primary triggers are HTTP routes / webhooks
   * (POST /api/v1/signals/track, POST /api/v1/webhooks/*), not the event bus.
   */
  register(): void {
    subscribeToEvent(EVENTS.CONTACTS_MAPPED, handleContactsMapped, { engine: SLUG });
  },

  /**
   * Best-effort health probe. Pings Postgres (trivial query) and Redis so the
   * /health endpoint can report connectivity. Never throws — degrades instead.
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
      last_event_processed_at: null,
    };
  },
} satisfies EngineModule;

export const engine = signalEngine;
export default signalEngine;
