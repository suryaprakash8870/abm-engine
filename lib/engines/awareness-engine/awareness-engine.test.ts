/**
 * Integration test for the Awareness Engine (engine 08).
 *
 * Every engine writes ONE integration test: feed a known input event, assert the
 * correct output event (conventions.md). Here we feed a `signal.received` event
 * and assert the handler publishes `account.score_updated`.
 */

import { describe, it, expect } from 'vitest';
import { fakeEvent, withCapturedEvents } from '../../events';
import { assertMatchesCatalog } from '../contract';
import { engine } from './index';
import { handleSignalReceived } from './handlers';

describe('awareness-engine', () => {
  it('matches the event catalog', () => {
    // The engine's declared consumes/publishes must match the frozen routing table.
    expect(() => assertMatchesCatalog(engine)).not.toThrow();
  });

  it('publishes account.score_updated when it consumes signal.received', async () => {
    const input = fakeEvent('signal.received', {
      account_id: 'acc_123',
      contact_id: null,
      signal_type: 'pricing_page_visit',
      signal_source: 'website',
      points_awarded: 15,
      decay_rate_per_week: 0.5,
      page_url: 'https://example.com/pricing',
      metadata: {},
      dedup_key: 'acc_123:pricing_page_visit:2026-06-16',
      occurred_at: '2026-06-16T11:59:00.000Z',
      received_at: '2026-06-16T12:00:00.000Z',
    });

    const published = await withCapturedEvents(async () => {
      await handleSignalReceived(input);
    });

    expect(published).toContainEqual(
      expect.objectContaining({ type: 'account.score_updated' }),
    );

    // TODO(owner): once computeScore() + persistScore() are implemented, assert
    // the real decayed/capped current_score, that account.stage_changed is emitted
    // only when a boundary is crossed, and that account.hot fires on a >20pt jump
    // within 48h. Also assert completionCheck() gates publishing (ADR-003).
  });
});
