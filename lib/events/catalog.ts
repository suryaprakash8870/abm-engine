/**
 * EVENT CATALOG — the routing map of the whole system.
 *
 * Mirrors the "Event bus contracts" table in docs/project/architecture.md.
 * This is the machine-readable version: which engine publishes each event, and
 * which engines consume it. Use it for wiring, validation, and the dependency graph.
 */

import type { EventName } from './types';

export type EngineSlug =
  | 'icp-engine'
  | 'tam-builder'
  | 'enrichment-engine'
  | 'scoring-engine'
  | 'tal-manager'
  | 'contact-engine'
  | 'signal-engine'
  | 'awareness-engine'
  | 'demand-gen-orchestrator'
  | 'crm-sync-engine'
  | 'gtm-flywheel';

export const ENGINE_SLUGS: EngineSlug[] = [
  'icp-engine',
  'tam-builder',
  'enrichment-engine',
  'scoring-engine',
  'tal-manager',
  'contact-engine',
  'signal-engine',
  'awareness-engine',
  'demand-gen-orchestrator',
  'crm-sync-engine',
  'gtm-flywheel',
];

/** Stable string constants so call-sites don't hardcode event-name string literals. */
export const EVENTS = {
  ICP_CREATED: 'icp.created',
  ICP_UPDATED: 'icp.updated',
  ICP_ERROR: 'icp.error',
  TAM_SEARCH_COMPLETED: 'tam.search_completed',
  TAM_SEARCH_FAILED: 'tam.search_failed',
  ACCOUNTS_ENRICHED: 'accounts.enriched',
  ENRICHMENT_FAILED: 'enrichment.failed',
  ACCOUNTS_SCORED: 'accounts.scored',
  SCORING_FAILED: 'scoring.failed',
  TAL_FINALIZED: 'tal.finalized',
  CONTACTS_MAPPED: 'contacts.mapped',
  CONTACTS_SOURCING_FAILED: 'contacts.sourcing_failed',
  SIGNAL_RECEIVED: 'signal.received',
  ACCOUNT_SCORE_UPDATED: 'account.score_updated',
  ACCOUNT_STAGE_CHANGED: 'account.stage_changed',
  ACCOUNT_HOT: 'account.hot',
  PLAY_FIRED: 'play.fired',
  PLAY_OUTCOME_RECORDED: 'play.outcome_recorded',
  CRM_SYNCED: 'crm.synced',
  CRM_DEAL_CLOSED_WON: 'crm.deal_closed_won',
  CRM_DEAL_CLOSED_LOST: 'crm.deal_closed_lost',
  FLYWHEEL_METRICS_UPDATED: 'flywheel.metrics_updated',
  ICP_REFRESH_RECOMMENDED: 'icp.refresh_recommended',
  FLYWHEEL_ERROR: 'flywheel.error',
} as const satisfies Record<string, EventName>;

export interface EventRoute {
  event: EventName;
  publishedBy: EngineSlug;
  consumedBy: EngineSlug[];
}

/**
 * The full pub/sub routing table. Keep aligned with docs/project/architecture.md.
 * `gtm-flywheel` is a passive listener on (almost) everything; we list only the
 * events it explicitly reacts to here, per the architecture doc.
 */
export const EVENT_ROUTES: EventRoute[] = [
  { event: 'icp.created', publishedBy: 'icp-engine', consumedBy: ['tam-builder', 'scoring-engine', 'enrichment-engine'] },
  { event: 'icp.updated', publishedBy: 'icp-engine', consumedBy: ['tam-builder', 'scoring-engine', 'gtm-flywheel'] },
  { event: 'icp.error', publishedBy: 'icp-engine', consumedBy: [] },
  { event: 'tam.search_completed', publishedBy: 'tam-builder', consumedBy: ['enrichment-engine'] },
  { event: 'tam.search_failed', publishedBy: 'tam-builder', consumedBy: [] },
  { event: 'accounts.enriched', publishedBy: 'enrichment-engine', consumedBy: ['scoring-engine'] },
  { event: 'enrichment.failed', publishedBy: 'enrichment-engine', consumedBy: [] },
  { event: 'accounts.scored', publishedBy: 'scoring-engine', consumedBy: ['tal-manager'] },
  { event: 'scoring.failed', publishedBy: 'scoring-engine', consumedBy: [] },
  { event: 'tal.finalized', publishedBy: 'tal-manager', consumedBy: ['contact-engine', 'crm-sync-engine'] },
  { event: 'contacts.mapped', publishedBy: 'contact-engine', consumedBy: ['signal-engine', 'crm-sync-engine'] },
  { event: 'contacts.sourcing_failed', publishedBy: 'contact-engine', consumedBy: [] },
  { event: 'signal.received', publishedBy: 'signal-engine', consumedBy: ['awareness-engine'] },
  { event: 'account.score_updated', publishedBy: 'awareness-engine', consumedBy: ['crm-sync-engine', 'gtm-flywheel'] },
  { event: 'account.stage_changed', publishedBy: 'awareness-engine', consumedBy: ['demand-gen-orchestrator'] },
  { event: 'account.hot', publishedBy: 'awareness-engine', consumedBy: ['demand-gen-orchestrator', 'gtm-flywheel'] },
  { event: 'play.fired', publishedBy: 'demand-gen-orchestrator', consumedBy: ['crm-sync-engine', 'gtm-flywheel'] },
  { event: 'play.outcome_recorded', publishedBy: 'demand-gen-orchestrator', consumedBy: ['gtm-flywheel', 'icp-engine'] },
  { event: 'crm.synced', publishedBy: 'crm-sync-engine', consumedBy: ['gtm-flywheel'] },
  { event: 'crm.deal_closed_won', publishedBy: 'crm-sync-engine', consumedBy: ['icp-engine', 'gtm-flywheel'] },
  { event: 'crm.deal_closed_lost', publishedBy: 'crm-sync-engine', consumedBy: ['icp-engine', 'gtm-flywheel'] },
  { event: 'flywheel.metrics_updated', publishedBy: 'gtm-flywheel', consumedBy: [] },
  { event: 'icp.refresh_recommended', publishedBy: 'gtm-flywheel', consumedBy: ['icp-engine'] },
  { event: 'flywheel.error', publishedBy: 'gtm-flywheel', consumedBy: [] },
];

/**
 * The BullMQ queue name for delivering an event to ONE subscribing engine.
 *
 * Fan-out, not competition: BullMQ is a work queue, so multiple engines on a single
 * queue would compete (only one gets each job). Each (event, engine) pair gets its
 * OWN queue so every subscriber receives every event. The publisher enqueues to one
 * queue per `consumedBy(event)` engine.
 *
 * MUST NOT contain ':' (BullMQ reserves it). Event names use dots, slugs use dashes,
 * so e.g. "event.icp.created.tam-builder".
 */
export function eventQueueName(event: EventName, engine: EngineSlug): string {
  return `event.${event}.${engine}`;
}

/** Events a given engine subscribes to (its triggers). */
export function consumedBy(slug: EngineSlug): EventName[] {
  return EVENT_ROUTES.filter((r) => r.consumedBy.includes(slug)).map((r) => r.event);
}

/** Events a given engine publishes (its outputs). */
export function publishedBy(slug: EngineSlug): EventName[] {
  return EVENT_ROUTES.filter((r) => r.publishedBy === slug).map((r) => r.event);
}

/** Engines that consume a given event (its fan-out targets when publishing). */
export function consumersOf(event: EventName): EngineSlug[] {
  return EVENT_ROUTES.find((r) => r.event === event)?.consumedBy ?? [];
}
