/**
 * Engine registry — the one place that knows all 11 engines.
 *
 * Used by the worker runner (workers/index.ts) to register every engine's BullMQ
 * subscriptions, and by tooling/health aggregation. This is the ONLY shared file
 * that imports every engine; individual engines never import each other.
 */

import type { EngineModule } from './contract';
import icpEngine from './icp-engine';
import tamBuilder from './tam-builder';
import enrichmentEngine from './enrichment-engine';
import scoringEngine from './scoring-engine';
import talManager from './tal-manager';
import contactEngine from './contact-engine';
import signalEngine from './signal-engine';
import awarenessEngine from './awareness-engine';
import demandGenOrchestrator from './demand-gen-orchestrator';
import crmSyncEngine from './crm-sync-engine';
import gtmFlywheel from './gtm-flywheel';

export const engines: EngineModule[] = [
  icpEngine,
  tamBuilder,
  enrichmentEngine,
  scoringEngine,
  talManager,
  contactEngine,
  signalEngine,
  awarenessEngine,
  demandGenOrchestrator,
  crmSyncEngine,
  gtmFlywheel,
];

export function engineBySlug(slug: string): EngineModule | undefined {
  return engines.find((e) => e.slug === slug);
}
