/**
 * Test harness — the key to INDEPENDENT, PARALLEL engine development.
 *
 * An engine owner does not need the upstream engine to exist. They:
 *   1. craft a fake input event with `fakeEvent(...)`,
 *   2. invoke their handler with it,
 *   3. assert the correct output event was "published" using a captured bus.
 *
 * `withCapturedEvents` swaps the real publisher for an in-memory recorder so the
 * integration test required for every engine (conventions.md) needs no Redis.
 *
 * Example (in lib/engines/<slug>/<slug>.test.ts):
 *
 *   const published = await withCapturedEvents(async (capture) => {
 *     await handleTamSearchCompleted(fakeEvent('tam.search_completed', { ... }));
 *   });
 *   expect(published).toContainEqual(
 *     expect.objectContaining({ type: 'accounts.enriched' }),
 *   );
 */

import { makeEnvelope } from './envelope';
import type { EventEnvelope, EventName, EventPayloads } from './types';

let captured: EventEnvelope[] | null = null;

/** Build a fully-formed fake event for tests. */
export function fakeEvent<T extends EventName>(
  type: T,
  payload: EventPayloads[T],
  ctx?: { workspaceId?: string; correlationId?: string },
): EventEnvelope<T> {
  return makeEnvelope(type, payload, {
    workspaceId: ctx?.workspaceId ?? 'ws_test',
    correlationId: ctx?.correlationId ?? 'corr_test',
  });
}

/**
 * Run `fn` with event publishing redirected into an in-memory array, which is
 * returned. Use the injected `record` from your engine's publisher, or import
 * `recordIfCapturing` inside publish.ts-equivalent helpers.
 */
export async function withCapturedEvents(
  fn: (capture: EventEnvelope[]) => Promise<void>,
): Promise<EventEnvelope[]> {
  const sink: EventEnvelope[] = [];
  captured = sink;
  try {
    await fn(sink);
  } finally {
    captured = null;
  }
  return sink;
}

/**
 * Engine publishers call this first; in a test it records and short-circuits the
 * real Redis publish. In production it returns false and the real publish runs.
 */
export function recordIfCapturing(envelope: EventEnvelope): boolean {
  if (captured) {
    captured.push(envelope);
    return true;
  }
  return false;
}
