/**
 * Engine 01 — ICP Engine.
 *
 * Builds the Ideal Customer Profile: the structured definition of who we should
 * be selling to. It is the FIRST engine in the system and the primary instruction
 * set every downstream engine consumes (TAM Builder, Scoring, Enrichment).
 *
 * Spec: ../../../docs/engines/engine-01-icp-engine.md
 *
 * TRIGGERS
 *   - Primary build is driven by DIRECT USER ACTION (wizard / CRM connect / CSV
 *     upload) via the HTTP routes under app/api/v1/icp/*. Those routes are NOT
 *     event subscriptions.
 *   - In ADDITION, the event catalog routes four feedback events to this engine
 *     (GTM-Flywheel + CRM-Sync + Orchestrator feedback). register() wires those
 *     so the ICP can be refreshed/re-versioned over time.
 */

import { prisma } from '../../db/client';
import { pingRedis } from '../../clients/redis';
import { consumedBy, publishedBy, subscribeToEvent } from '../../events';
import type { EngineModule, HealthStatus } from '../contract';
import {
  handlePlayOutcomeRecorded,
  handleCrmDealClosedWon,
  handleCrmDealClosedLost,
  handleIcpRefreshRecommended,
} from './handlers';
import { startSynthesisWorker } from './synthesis-queue';
import { startAnalysisWorker } from './analysis-queue';

const SLUG = 'icp-engine' as const;
const VERSION = '0.1.0';

const icpEngine = {
  slug: SLUG,
  consumes: consumedBy(SLUG),
  publishes: publishedBy(SLUG),

  /**
   * Wire BullMQ subscriptions for the feedback events the catalog routes here.
   * NOTE: the engine's PRIMARY trigger is user action over HTTP (wizard / CRM
   * connect / CSV upload) — those are routes under app/api/v1/icp/*, not events.
   * The subscriptions below are only the flywheel/CRM feedback loop that can
   * re-version an existing ICP.
   */
  register(): void {
    subscribeToEvent('play.outcome_recorded', handlePlayOutcomeRecorded, { engine: SLUG });
    subscribeToEvent('crm.deal_closed_won', handleCrmDealClosedWon, { engine: SLUG });
    subscribeToEvent('crm.deal_closed_lost', handleCrmDealClosedLost, { engine: SLUG });
    subscribeToEvent('icp.refresh_recommended', handleIcpRefreshRecommended, { engine: SLUG });

    // Modes A / B / C enqueue their heavy work; these workers run it (Claude is
    // async/queued, never inline in a request — CLAUDE.md rule 5).
    startSynthesisWorker(); // Mode A — wizard synthesis
    startAnalysisWorker(); // Modes B & C — deal analysis
  },

  /** Best-effort health probe backing GET /api/v1/icp-engine/health. */
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
      last_event_processed_at: null,
    };
  },
} satisfies EngineModule;

export const engine: EngineModule = icpEngine;
export default icpEngine;
