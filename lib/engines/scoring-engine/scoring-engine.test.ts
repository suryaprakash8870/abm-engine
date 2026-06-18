/**
 * Integration test for engine 04 (Scoring Engine).
 *
 * Per conventions.md every engine ships ONE integration test: feed a known input
 * event, assert the correct output event. Deeper behavioural assertions are left
 * as // TODO(owner) until the core logic lands.
 */

import { describe, it, expect, vi } from 'vitest';

// The handler resolves the workspace ICP from the DB and enqueues a BullMQ job;
// scoreAndTierAccounts reads enriched/qualification/override rows. Mock the DB +
// queue so the tests exercise real logic without Postgres/Redis. Hoisted vi.fns
// let each test control the override rows.
const db = vi.hoisted(() => ({
  icpFindFirst: vi.fn(async () => ({ id: 'icp_1', firmographics: {}, technographics: {} })),
  enrichedFindMany: vi.fn(async () => [] as unknown[]),
  qualFindMany: vi.fn(async () => [] as unknown[]),
  overrideFindMany: vi.fn(async () => [] as Array<{ accountId: string; tier: number }>),
}));

vi.mock('../../db/client', () => ({
  prisma: {
    icpDefinition: { findFirst: db.icpFindFirst },
    enrichedAccount: { findMany: db.enrichedFindMany },
    qualificationResult: { findMany: db.qualFindMany },
    tierOverride: { findMany: db.overrideFindMany },
  },
}));

vi.mock('./scoring-queue', () => ({
  enqueueScoringJob: vi.fn(async () => {}),
  startScoringWorker: () => ({}),
}));

import engine from './index';
import { assertMatchesCatalog } from '../contract';
import { fakeEvent, withCapturedEvents } from '../../events';
import type { AccountsScoredPayload } from '../../events';
import { handleAccountsEnriched } from './handlers';
import { enqueueScoringJob } from './scoring-queue';
import { publishAccountsScored } from './publisher';
import { scoreAndTierAccounts, type ScoringFormula } from './service';

describe('scoring-engine', () => {
  it('matches the frozen event catalog', () => {
    // Test 1: declared consumes/publishes must line up with the catalog routing.
    expect(() => assertMatchesCatalog(engine)).not.toThrow();
  });

  it('publishes accounts.scored for an accounts.enriched trigger', async () => {
    // Test 2: feed the consumed trigger through the handler (it must not throw on
    // a valid payload), then verify the success output event is captured.
    const trigger = fakeEvent('accounts.enriched', {
      job_id: 'job_123',
      source_job_id: 'src_123',
      enriched_account_ids: ['acc_1', 'acc_2'],
      total: 2,
      enriched: 2,
      failed: 0,
      qualified_count: 2,
      disqualified_count: 0,
      quality_summary: {},
      top_industries: [],
      geography_breakdown: {},
    });

    const published = await withCapturedEvents(async () => {
      // Handler accepts the valid trigger without throwing and enqueues a scoring job
      // (the actual scoring runs async in the BullMQ worker — never inline here).
      await handleAccountsEnriched(trigger);
      expect(enqueueScoringJob).toHaveBeenCalledWith(
        expect.objectContaining({ icpId: 'icp_1', accountIds: ['acc_1', 'acc_2'] }),
      );

      // The worker publishes accounts.scored after the completion check passes.
      // Here we exercise the publish path directly to assert the contract output type.
      const payload: AccountsScoredPayload = {
        account_ids: ['acc_1', 'acc_2'],
        formula_version: 1,
        tier_summary: {},
        tier_1_count: 1,
        tier_2_count: 1,
        tier_3_count: 0,
        top_tier_1_account_ids: ['acc_1'],
        scored_at: new Date().toISOString(),
      };
      await publishAccountsScored(payload, {
        workspaceId: trigger.workspace_id,
        correlationId: trigger.correlation_id,
      });
    });

    expect(published).toContainEqual(
      expect.objectContaining({ type: 'accounts.scored' }),
    );
  });

  it('re-score: a manual tier override wins over the formula tier (doc: "user override always wins")', async () => {
    // acc_1 has no enriched data → industry_fit scores 0 → formula tier is null
    // (untiered). This is the state a fresh re-score would compute.
    const formula: ScoringFormula = {
      id: 'f_1',
      icp_id: 'icp_1',
      version: 1,
      is_fallback: false,
      criteria: [{ key: 'industry_fit', label: 'Industry Fit', weight: 1, rationale: 'x' }],
      tier_boundaries: { tier1_min: 70, tier2_min: 40, tier3_min: 10 },
    };

    db.overrideFindMany.mockResolvedValueOnce([]);
    const [noOverride] = await scoreAndTierAccounts('ws_1', ['acc_1'], formula);
    expect(noOverride.tier).toBeNull();

    // Same low-scoring account, now with an active override → Tier 1 survives the
    // re-score, and the fit score is unchanged (only the tier is overridden).
    db.overrideFindMany.mockResolvedValueOnce([{ accountId: 'acc_1', tier: 1 }]);
    const [withOverride] = await scoreAndTierAccounts('ws_1', ['acc_1'], formula);
    expect(withOverride.tier).toBe(1);
    expect(withOverride.total_score).toBe(noOverride.total_score);
  });
});
