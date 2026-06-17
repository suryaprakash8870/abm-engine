/**
 * Engine 04 — Scoring Engine.
 *
 * Consumes: accounts.enriched, icp.created, icp.updated
 * Publishes: accounts.scored, scoring.failed
 *
 * @see ../../../docs/engines/engine-04-scoring-engine.md
 */

import { consumedBy, publishedBy } from '../../events';
import { subscribeToEvent } from '../../events';
import type { EngineModule, HealthStatus } from '../contract';
import { prisma } from '../../db/client';
import { pingRedis } from '../../clients/redis';
import { handleAccountsEnriched, handleIcpCreatedOrUpdated } from './handlers';
import { startScoringWorker } from './scoring-queue';

const SLUG = 'scoring-engine' as const;
const VERSION = '0.1.0';

export const engine = {
  slug: SLUG,
  consumes: consumedBy(SLUG),
  publishes: publishedBy(SLUG),

  register(): void {
    subscribeToEvent('accounts.enriched', handleAccountsEnriched, { engine: SLUG });
    subscribeToEvent('icp.created', handleIcpCreatedOrUpdated as Parameters<typeof subscribeToEvent>[1], { engine: SLUG });
    subscribeToEvent('icp.updated', handleIcpCreatedOrUpdated as Parameters<typeof subscribeToEvent>[1], { engine: SLUG });
    startScoringWorker();
  },

  async health(): Promise<HealthStatus> {
    let db_connected = false;
    let queue_connected = false;

    try { await prisma.$queryRaw`SELECT 1`; db_connected = true; } catch { db_connected = false; }
    try { queue_connected = await pingRedis(); } catch { queue_connected = false; }

    const status: HealthStatus['status'] =
      db_connected && queue_connected ? 'ok' : db_connected || queue_connected ? 'degraded' : 'down';

    return { status, version: VERSION, db_connected, queue_connected, last_event_processed_at: null };
  },
} satisfies EngineModule;

export default engine;
