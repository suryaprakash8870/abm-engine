/**
 * Engine 11 — GTM Flywheel · EngineModule.
 *
 * Attribution, insights, and the ICP feedback loop. A passive listener across the
 * system: it subscribes to the events it explicitly reacts to (catalog), records
 * insight, and publishes flywheel.metrics_updated / icp.refresh_recommended.
 *
 * The single source of truth for this engine's consumes/publishes is the catalog
 * (`consumedBy` / `publishedBy`); `assertMatchesCatalog` (in the test) guards drift.
 */

import { prisma } from '../../db/client';
import { pingRedis } from '../../clients/redis';
import {
  consumedBy,
  publishedBy,
  subscribeToEvent,
  type EventName,
} from '../../events';
import type { EngineModule, HealthStatus } from '../contract';
import {
  handleAccountHot,
  handleAccountScoreUpdated,
  handleCrmDealClosedLost,
  handleCrmDealClosedWon,
  handleCrmSynced,
  handleIcpUpdated,
  handlePlayFired,
  handlePlayOutcomeRecorded,
} from './handlers';

const SLUG = 'gtm-flywheel' as const;

/** Route each consumed event to its handler. Used only inside `register()`. */
const HANDLERS = {
  'icp.updated': handleIcpUpdated,
  'account.score_updated': handleAccountScoreUpdated,
  'account.hot': handleAccountHot,
  'play.fired': handlePlayFired,
  'play.outcome_recorded': handlePlayOutcomeRecorded,
  'crm.synced': handleCrmSynced,
  'crm.deal_closed_won': handleCrmDealClosedWon,
  'crm.deal_closed_lost': handleCrmDealClosedLost,
} as const;

const engine = {
  slug: SLUG,
  consumes: consumedBy(SLUG),
  publishes: publishedBy(SLUG),

  /**
   * Wire BullMQ subscriptions: one worker per consumed event → its handler. Called
   * by the worker runner (`npm run worker`), never inside a web request.
   */
  register(): void {
    for (const event of consumedBy(SLUG)) {
      const handler = HANDLERS[event as keyof typeof HANDLERS];
      if (!handler) continue; // catalog has a consumed event with no handler wired yet
      subscribeToEvent(event as EventName, handler as never, { engine: SLUG });
    }
  },

  /**
   * Best-effort health probe backing GET /api/v1/gtm-flywheel/health. Pings the DB
   * and Redis inside try/catch so the endpoint never throws.
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
      // TODO(owner): track the timestamp of the last successfully processed event.
      last_event_processed_at: null,
    };
  },
} satisfies EngineModule;

export default engine;
export { engine };
