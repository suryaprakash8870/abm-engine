/**
 * The Engine contract — every one of the 11 engines implements this shape.
 *
 * This is what makes an engine a swappable, independently-deployable unit
 * (ADR-012). An engine:
 *   - declares which events it consumes and publishes,
 *   - exposes `register()` to wire its BullMQ subscriptions,
 *   - exposes `health()` for its /health endpoint.
 *
 * The single source of truth for a slug's consumes/publishes is the catalog;
 * `assertMatchesCatalog` guards against an engine drifting from the contract.
 */

import { consumedBy, publishedBy, type EngineSlug } from '../events/catalog';
import type { EventName } from '../events/types';

export interface HealthStatus {
  status: 'ok' | 'degraded' | 'down';
  version: string;
  db_connected: boolean;
  queue_connected: boolean;
  last_event_processed_at: string | null;
}

export interface EngineModule {
  /** kebab-case slug, e.g. "icp-engine". */
  slug: EngineSlug;
  /** Trigger events this engine subscribes to. */
  consumes: EventName[];
  /** Events this engine publishes. */
  publishes: EventName[];
  /** Wire up BullMQ subscriptions. Called by the worker runner, never in a request. */
  register(): void;
  /** Health probe backing GET /api/v1/<slug>/health. */
  health(): Promise<HealthStatus>;
}

/**
 * Dev-time guard: an engine's declared events must match the frozen catalog.
 * Call this in the engine's integration test.
 */
export function assertMatchesCatalog(engine: EngineModule): void {
  const expectedConsumes = new Set(consumedBy(engine.slug));
  const expectedPublishes = new Set(publishedBy(engine.slug));
  for (const e of engine.consumes) {
    if (!expectedConsumes.has(e)) {
      throw new Error(`[${engine.slug}] consumes "${e}" but the catalog does not route it here.`);
    }
  }
  for (const e of engine.publishes) {
    if (!expectedPublishes.has(e)) {
      throw new Error(`[${engine.slug}] publishes "${e}" but the catalog says another engine owns it.`);
    }
  }
}
