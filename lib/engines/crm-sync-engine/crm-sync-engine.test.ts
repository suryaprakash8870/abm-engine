/**
 * Integration test for the CRM Sync Engine (engine 10).
 *
 * Every engine writes ONE integration test: feed a known input event, assert the
 * correct output event (conventions.md). Here we feed a `tal.finalized` event and
 * assert the handler publishes `crm.synced`.
 */

import { describe, it, expect } from 'vitest';
import { fakeEvent, withCapturedEvents } from '../../events';
import { assertMatchesCatalog } from '../contract';
import { engine } from './index';
import { handleTalFinalized } from './handlers';

describe('crm-sync-engine', () => {
  it('matches the event catalog', () => {
    // The engine's declared consumes/publishes must match the frozen routing table.
    expect(() => assertMatchesCatalog(engine)).not.toThrow();
  });

  it('publishes crm.synced when it consumes tal.finalized', async () => {
    const input = fakeEvent('tal.finalized', {
      tal_id: 'tal_123',
      version: 1,
      version_number: 1,
      account_count: 42,
      tier1_count: 10,
      tier2_count: 20,
      tier3_count: 12,
      status: 'finalized',
      review_status: 'reviewed',
      suppressed_count: 0,
      finalized_at: '2026-06-16T12:00:00.000Z',
    });

    const published = await withCapturedEvents(async () => {
      await handleTalFinalized(input);
    });

    expect(published).toContainEqual(
      expect.objectContaining({ type: 'crm.synced' }),
    );

    // TODO(owner): once writeBatch() is implemented, assert real record counts,
    // status === 'completed', error counts, and the dead-letter behaviour. Also
    // add a test feeding an inbound deal webhook → crm.deal_closed_won/lost.
  });
});
