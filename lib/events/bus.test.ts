/**
 * Foundation event-bus guards.
 *
 *  - BullMQ throws "Queue name cannot contain :" → no queue name may contain ':'.
 *  - Fan-out correctness: every (event, engine) pair maps to a unique queue, so each
 *    subscriber gets its own copy of the event (not competing on one queue).
 *
 * Engine unit tests mock the bus, so only this test (+ a live worker) catches these.
 */

import { describe, it, expect } from 'vitest';
import { EVENT_ROUTES, eventQueueName } from './catalog';

describe('event bus', () => {
  it('no event queue name contains ":"', () => {
    for (const route of EVENT_ROUTES) {
      for (const engine of route.consumedBy) {
        expect(eventQueueName(route.event, engine)).not.toContain(':');
      }
    }
  });

  it('every (event, engine) pair has a unique queue (fan-out, not competition)', () => {
    const names = EVENT_ROUTES.flatMap((r) => r.consumedBy.map((e) => eventQueueName(r.event, e)));
    expect(new Set(names).size).toBe(names.length);
  });
});
