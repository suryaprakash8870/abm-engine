/**
 * Engine 10 — CRM Sync Engine.
 *
 * Centralises ALL CRM I/O: it consumes CRM-write events from upstream engines,
 * batches + rate-limits the writes, and publishes the result. It also listens to
 * inbound CRM deal-stage webhooks (via HTTP routes) and publishes the critical
 * closed-won / closed-lost feedback loop.
 *
 * Contract: see lib/engines/contract.ts. Catalog (source of truth for
 * consumes/publishes): lib/events/catalog.ts.
 */

import { consumedBy, publishedBy, subscribeToEvent } from '../../events';
import { prisma } from '../../db/client';
import { pingRedis } from '../../clients/redis';
import type { EngineModule, HealthStatus } from '../contract';
import {
  handleTalFinalized,
  handleContactsMapped,
  handleAccountScoreUpdated,
  handlePlayFired,
} from './handlers';

const SLUG = 'crm-sync-engine' as const;

const crmSyncEngine = {
  slug: SLUG,
  consumes: consumedBy(SLUG),
  publishes: publishedBy(SLUG),

  /**
   * Wire each consumed event to its handler on a BullMQ worker.
   * Consumed (catalog): tal.finalized, contacts.mapped, account.score_updated, play.fired.
   *
   * NOTE: this engine ALSO has non-event triggers — inbound CRM deal-stage
   * webhooks arrive over HTTP at POST /api/v1/webhooks/hubspot-deals and produce
   * crm.deal_closed_won / crm.deal_closed_lost. Those are wired by the API route,
   * not here; register() only handles the event-bus subscriptions.
   */
  register(): void {
    subscribeToEvent('tal.finalized', handleTalFinalized, { engine: SLUG });
    subscribeToEvent('contacts.mapped', handleContactsMapped, { engine: SLUG });
    subscribeToEvent('account.score_updated', handleAccountScoreUpdated, { engine: SLUG });
    subscribeToEvent('play.fired', handlePlayFired, { engine: SLUG });
  },

  /**
   * Best-effort health probe backing GET /api/v1/crm-sync-engine/health.
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
      last_event_processed_at: null, // TODO(owner): surface from sync_log / last processed event.
    };
  },
} satisfies EngineModule;

export const engine = crmSyncEngine;
export default crmSyncEngine;
