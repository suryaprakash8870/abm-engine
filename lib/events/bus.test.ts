/**
 * Foundation event-bus guards.
 *
 * Regression: BullMQ throws "Queue name cannot contain :" — so the queue name for
 * EVERY event must avoid ':'. The unit tests for engines mock the bus, so only
 * this test (and a live worker) catches a bad queue name.
 */

import { describe, it, expect } from 'vitest';
import { EVENT_ROUTES, eventQueueName } from './catalog';

describe('event bus', () => {
  it('no event queue name contains ":" (BullMQ would throw)', () => {
    for (const route of EVENT_ROUTES) {
      const name = eventQueueName(route.event);
      expect(name).not.toContain(':');
    }
  });

  it('queue names are unique per event', () => {
    const names = EVENT_ROUTES.map((r) => eventQueueName(r.event));
    expect(new Set(names).size).toBe(names.length);
  });
});
