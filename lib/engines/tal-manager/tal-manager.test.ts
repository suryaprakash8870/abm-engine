/**
 * Integration test for the TAL Manager engine (#05).
 *
 * Two guarantees (conventions.md):
 *   1. The engine's declared consumes/publishes match the frozen catalog.
 *   2. Feeding a known input event yields the correct output event.
 *
 * Deeper business assertions are left as // TODO(owner) until the service layer
 * is implemented.
 */

import { describe, it, expect } from 'vitest';
import { engine } from './index';
import { handleAccountsScored } from './handlers';
import { assertMatchesCatalog } from '../contract';
import { fakeEvent, withCapturedEvents } from '../../events';
import type { AccountsScoredPayload } from '../../events';

const sampleScored: AccountsScoredPayload = {
  account_ids: ['acc_1', 'acc_2', 'acc_3'],
  formula_version: 1,
  tier_summary: { tier_1: 1, tier_2: 1, tier_3: 1 },
  tier_1_count: 1,
  tier_2_count: 1,
  tier_3_count: 1,
  top_tier_1_account_ids: ['acc_1'],
  scored_at: '2026-06-16T12:00:00.000Z',
};

describe('tal-manager engine', () => {
  it('matches the event catalog', () => {
    expect(() => assertMatchesCatalog(engine)).not.toThrow();
  });

  it('publishes tal.finalized when it consumes accounts.scored', async () => {
    const published = await withCapturedEvents(async () => {
      await handleAccountsScored(fakeEvent('accounts.scored', sampleScored));
    });

    expect(published).toContainEqual(expect.objectContaining({ type: 'tal.finalized' }));
    // TODO(owner): assert suppressed_count, tier counts, review_status, and that
    // the completion check gated the publish once service.ts is implemented.
  });
});
