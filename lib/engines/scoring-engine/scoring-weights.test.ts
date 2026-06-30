/**
 * Regression test for the "sliders don't re-tier accounts" bug.
 *
 * Runs the REAL scoreAndTierAccounts over a fixed set of varied accounts with two
 * different weight formulas (industry-heavy vs. signals-heavy) and asserts the
 * tier distribution actually CHANGES. This proves the criterion keys map to the
 * scorer's evaluators (industry_fit / company_size / tech_stack / buying_signals)
 * so weights matter — the previous keys fell to a flat proxy and made scoring
 * weight-blind.
 */

import { describe, it, expect, vi } from 'vitest';

// Varied accounts: each differs on industry / size / tech / qualified so the
// per-criterion matches differ — exactly what makes weights move the outcome.
const ACCOUNTS = [
  { id: 'a1', accountId: 'x1', industry: 'Cybersecurity', headcount: 1000, techStack: ['HubSpot', 'Snowflake'], qualified: true },
  { id: 'a2', accountId: 'x2', industry: 'Cybersecurity', headcount: 100, techStack: [], qualified: false },
  { id: 'a3', accountId: 'x3', industry: 'Retail', headcount: 1000, techStack: ['HubSpot'], qualified: true },
  { id: 'a4', accountId: 'x4', industry: 'Retail', headcount: 100, techStack: [], qualified: true },
  { id: 'a5', accountId: 'x5', industry: 'Software', headcount: 3000, techStack: ['HubSpot', 'AWS'], qualified: false },
  { id: 'a6', accountId: 'x6', industry: 'Retail', headcount: 50, techStack: [], qualified: false },
  { id: 'a7', accountId: 'x7', industry: 'Software', headcount: 800, techStack: ['Snowflake'], qualified: true },
  { id: 'a8', accountId: 'x8', industry: 'Cybersecurity', headcount: 6000, techStack: [], qualified: false },
  { id: 'a9', accountId: 'x9', industry: 'Retail', headcount: 2000, techStack: ['HubSpot', 'Snowflake'], qualified: false },
  { id: 'a10', accountId: 'x10', industry: 'Software', headcount: 4000, techStack: ['HubSpot'], qualified: true },
];

const db = vi.hoisted(() => ({
  icpFindFirst: vi.fn(async () => ({
    id: 'icp_1',
    firmographics: { industries: ['Cybersecurity', 'Software'], employee_min: 500, employee_max: 5000 },
    technographics: { required: ['HubSpot'], preferred: ['Snowflake', 'AWS'] },
  })),
  enrichedFindMany: vi.fn(async () => ACCOUNTS.map((a) => ({ id: a.id, accountId: a.accountId, industry: a.industry, headcount: a.headcount, techStack: a.techStack }))),
  qualFindMany: vi.fn(async () => ACCOUNTS.map((a) => ({ accountId: a.accountId, qualified: a.qualified }))),
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

import { scoreAndTierAccounts, type ScoringFormula } from './service';

const KEYS = ['industry_fit', 'company_size', 'tech_stack', 'buying_signals'] as const;
const formula = (weights: [number, number, number, number]): ScoringFormula => ({
  id: 'f1',
  icp_id: 'icp_1',
  version: 1,
  is_fallback: false,
  tier_boundaries: { tier1_min: 70, tier2_min: 40, tier3_min: 10 },
  criteria: KEYS.map((key, i) => ({ key, label: key, weight: weights[i], rationale: '' })),
});

const dist = (scored: { tier: number | null }[]) => ({
  t1: scored.filter((s) => s.tier === 1).length,
  t2: scored.filter((s) => s.tier === 2).length,
  t3: scored.filter((s) => s.tier === 3).length,
  none: scored.filter((s) => s.tier === null).length,
});

describe('scoring responds to weight changes', () => {
  const ids = ACCOUNTS.map((a) => a.id);

  it('shifts the tier distribution when weights change', async () => {
    const industryHeavy = await scoreAndTierAccounts('ws', ids, formula([0.7, 0.1, 0.1, 0.1]));
    const signalsHeavy = await scoreAndTierAccounts('ws', ids, formula([0.1, 0.1, 0.1, 0.7]));

    const dA = dist(industryHeavy);
    const dB = dist(signalsHeavy);

    // The whole point: the distribution must NOT be identical across weightings.
    expect(JSON.stringify(dA)).not.toBe(JSON.stringify(dB));

    // And at least one account must land in a different tier under each weighting.
    const tierA = new Map(industryHeavy.map((s) => [s.account_id, s.tier]));
    const moved = signalsHeavy.filter((s) => tierA.get(s.account_id) !== s.tier);
    expect(moved.length).toBeGreaterThan(0);
  });

  it('produces differentiated scores (not all the same)', async () => {
    const scored = await scoreAndTierAccounts('ws', ids, formula([0.3, 0.25, 0.25, 0.2]));
    const uniqueScores = new Set(scored.map((s) => s.total_score));
    // The old bug made every qualified account score exactly 50.
    expect(uniqueScores.size).toBeGreaterThan(3);
  });
});
