/**
 * Tests for the ICP Engine (Mode A — Hypothesis wizard).
 *
 *  - catalog match (every engine)
 *  - runIcpSynthesis publishes icp.created from valid wizard answers (Claude + DB mocked)
 *  - invalid synthesis output → icp.error (verify-before-publish, ADR-003)
 *  - routeToMode routing logic
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Shared, mutable mock state (hoisted so the vi.mock factories can read it).
const h = vi.hoisted(() => {
  const validContent: unknown = {
    firmographics: {
      industries: ['Software'],
      employee_min: 51,
      employee_max: 1000,
      geographies: ['North America'],
      business_model: 'B2B SaaS',
    },
    technographics: { required: ['HubSpot'], preferred: ['Segment'], excluded: [] },
    signals: { high_intent: ['pricing page visit'], medium_intent: ['blog read'] },
    exclusions: { industries: ['Government'], disqualifiers: ['<10 employees'] },
    criteria_confidence: { firmographics: 0.9, technographics: 0.6, signals: 0.7, exclusions: 0.5 },
    rationale: 'Mid-market SaaS fits best.',
  };
  return { validContent, toolInput: validContent as unknown };
});

vi.mock('../../clients/anthropic', () => ({
  MODELS: { reasoning: 'claude-sonnet-4-6', batch: 'claude-haiku-4-5' },
  anthropic: () => ({
    messages: {
      create: async () => ({
        content: [{ type: 'tool_use', name: 'emit_icp', input: h.toolInput }],
      }),
    },
  }),
}));

vi.mock('../../db/client', () => ({
  prisma: {
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        icpDefinition: { create: async () => ({ id: 'icp_1', version: 1, mode: 'hypothesis' }) },
        icpVersion: { create: async () => ({}) },
        icpConfidenceHistory: { create: async () => ({}) },
      }),
    wizardSession: { update: async () => ({}) },
    icpDefinition: { findFirst: async () => null },
    crmAnalysisJob: { create: async () => ({ id: 'job_1' }), update: async () => ({}), findFirst: async () => null },
  },
}));

import { withCapturedEvents } from '../../events';
import { assertMatchesCatalog } from '../contract';
import engine from './index';
import { runIcpSynthesis, runDealAnalysis, routeToMode } from './service';
import { WIZARD_QUESTION_IDS } from './types';
import {
  analyseDeals,
  computeDealStats,
  mapCsvRowsToDeals,
  InsufficientDealsError,
  type Deal,
} from './analysis';

const answers = Object.fromEntries(WIZARD_QUESTION_IDS.map((id) => [id, 'sample answer']));

describe('icp-engine', () => {
  beforeEach(() => {
    h.toolInput = h.validContent;
  });

  it('matches the event catalog', () => {
    expect(() => assertMatchesCatalog(engine)).not.toThrow();
  });

  it('publishes icp.created from valid wizard answers', async () => {
    const published = await withCapturedEvents(async () => {
      await runIcpSynthesis({ workspaceId: 'ws_1', answers, correlationId: 'corr_1' });
    });

    const created = published.find((e) => e.type === 'icp.created');
    expect(created).toBeDefined();
    expect(created!.workspace_id).toBe('ws_1');
    expect(created!.payload).toMatchObject({ icp_id: 'icp_1', version: 1, mode: 'hypothesis' });
    // confidence = mean(0.9, 0.6, 0.7, 0.5) = 0.68
    expect((created!.payload as { confidence_score: number }).confidence_score).toBeCloseTo(0.68, 2);
    expect(published.some((e) => e.type === 'icp.error')).toBe(false);
  });

  it('publishes icp.error (not icp.created) when synthesis output is invalid', async () => {
    h.toolInput = { firmographics: { industries: [] } }; // fails icpContentSchema

    const published = await withCapturedEvents(async () => {
      await runIcpSynthesis({ workspaceId: 'ws_1', answers, correlationId: 'corr_1' });
    });

    expect(published.some((e) => e.type === 'icp.created')).toBe(false);
    expect(published.some((e) => e.type === 'icp.error')).toBe(true);
  });
});

describe('routeToMode', () => {
  it('routes a user with a CRM and deals to crm_analysis', () => {
    expect(routeToMode({ has_crm: true, has_deals: true, main_goal: 'pipeline' })).toBe('crm_analysis');
  });
  it('routes a user with no deals to hypothesis', () => {
    expect(routeToMode({ has_crm: true, has_deals: false, main_goal: 'pipeline' })).toBe('hypothesis');
    expect(routeToMode({ has_crm: false, has_deals: false, main_goal: 'pipeline' })).toBe('hypothesis');
  });
  it('routes a no-CRM user with deals to csv_import', () => {
    expect(routeToMode({ has_crm: false, has_deals: true, main_goal: 'pipeline' })).toBe('csv_import');
  });
});

describe('icp-engine Modes B/C (deal analysis)', () => {
  beforeEach(() => {
    h.toolInput = h.validContent;
  });

  const sampleDeals: Deal[] = [
    ...Array.from({ length: 6 }, (_, i) => ({
      outcome: 'won' as const,
      domain: `won${i}.com`,
      industry: 'Software',
      employees: 100 + i,
      geography: 'North America',
      tech: ['HubSpot'],
      amount: 10_000,
    })),
    { outcome: 'lost', industry: 'Government', employees: 5000, geography: 'EU' },
    { outcome: 'lost', industry: 'Government', employees: 3000, geography: 'EU' },
  ];

  it('analyseDeals throws InsufficientDealsError below the threshold', async () => {
    await expect(analyseDeals([{ outcome: 'won', industry: 'X' }])).rejects.toBeInstanceOf(InsufficientDealsError);
  });

  it('computeDealStats summarises wins, losses, and industry win rate', () => {
    const s = computeDealStats(sampleDeals);
    expect(s.wonCount).toBe(6);
    expect(s.lostCount).toBe(2);
    expect(s.industryWinRate.find((i) => i.industry === 'Software')?.won).toBe(6);
    expect(s.lostIndustries[0]?.industry).toBe('Government');
    expect(s.avgWonAmount).toBe(10_000);
  });

  it('mapCsvRowsToDeals maps via field mapping and skips open deals', () => {
    const rows = [
      { Stage: 'Closed Won', Industry: 'SaaS', Emp: '120' },
      { Stage: 'Closed Lost', Industry: 'Gov', Emp: '9000' },
      { Stage: 'Open', Industry: 'X', Emp: '1' },
    ];
    const deals = mapCsvRowsToDeals(rows, { outcome: 'Stage', industry: 'Industry', employees: 'Emp' });
    expect(deals).toHaveLength(2);
    expect(deals[0]).toMatchObject({ outcome: 'won', industry: 'SaaS', employees: 120 });
    expect(deals[1].outcome).toBe('lost');
  });

  it('runDealAnalysis publishes icp.created for a CRM analysis (Claude+DB mocked)', async () => {
    const published = await withCapturedEvents(async () => {
      await runDealAnalysis({ workspaceId: 'ws_1', jobId: 'job_1', mode: 'crm_analysis', deals: sampleDeals, correlationId: 'corr_1' });
    });
    const created = published.find((e) => e.type === 'icp.created');
    expect(created).toBeDefined();
    expect(created!.payload).toMatchObject({ mode: 'crm_analysis', icp_id: 'icp_1' });
  });

  it('runDealAnalysis publishes icp.error (not icp.created) when there are too few wins', async () => {
    const published = await withCapturedEvents(async () => {
      await runDealAnalysis({ workspaceId: 'ws_1', jobId: 'job_1', mode: 'csv_import', deals: [{ outcome: 'won', industry: 'X' }], correlationId: 'corr_1' });
    });
    expect(published.some((e) => e.type === 'icp.created')).toBe(false);
    expect(published.some((e) => e.type === 'icp.error')).toBe(true);
  });
});
