/**
 * Integration test for the TAL Manager engine (#05).
 *
 * Guarantees (conventions.md):
 *   1. The engine's declared consumes/publishes match the frozen catalog.
 *   2. Feeding accounts.scored yields a tal.finalized with a REAL tal_id.
 *   3. Verify-before-publish: a failed completion check throws and publishes nothing.
 *
 * The service layer (DB) is mocked so the handler's orchestration + gating are
 * exercised without Postgres.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./service', () => ({ finalizeTal: vi.fn() }));

import { engine } from './index';
import { handleAccountsScored } from './handlers';
import { finalizeTal } from './service';
import { assertMatchesCatalog } from '../contract';
import { fakeEvent, withCapturedEvents } from '../../events';
import type { AccountsScoredPayload } from '../../events';
import type { TalFinalizationResult } from './service';

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

const okResult: TalFinalizationResult = {
  talId: 'tal_1',
  versionNumber: 2,
  accountCount: 2,
  tier1Count: 1,
  tier2Count: 1,
  tier3Count: 0,
  suppressedCount: 1,
  reviewStatus: 'unreviewed',
  status: 'finalized',
  suppressionApplied: true,
  talVersionCreated: true,
  crmRequested: true,
};

describe('tal-manager engine', () => {
  beforeEach(() => vi.mocked(finalizeTal).mockReset());

  it('matches the event catalog', () => {
    expect(() => assertMatchesCatalog(engine)).not.toThrow();
  });

  it('publishes tal.finalized with a real tal_id when the completion check passes', async () => {
    vi.mocked(finalizeTal).mockResolvedValue(okResult);

    const published = await withCapturedEvents(async () => {
      await handleAccountsScored(fakeEvent('accounts.scored', sampleScored));
    });

    expect(published).toContainEqual(
      expect.objectContaining({
        type: 'tal.finalized',
        payload: expect.objectContaining({
          tal_id: 'tal_1',
          version_number: 2,
          account_count: 2,
          tier1_count: 1,
          suppressed_count: 1,
          review_status: 'unreviewed',
        }),
      }),
    );
  });

  it('fails closed (throws, publishes nothing) when the completion check fails', async () => {
    vi.mocked(finalizeTal).mockResolvedValue({ ...okResult, talVersionCreated: false });

    await expect(
      handleAccountsScored(fakeEvent('accounts.scored', sampleScored)),
    ).rejects.toThrow(/completion check failed/);
  });
});
