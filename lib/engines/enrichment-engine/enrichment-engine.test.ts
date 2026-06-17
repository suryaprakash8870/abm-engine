/**
 * Tests for the Enrichment Engine (engine 03).
 *  - catalog match
 *  - qualifyRuleBased (fit + exclusion)
 *  - runEnrichment: enrich + qualify → accounts.enriched with the right counts
 *    (enrich client + DB mocked)
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('../../clients/enrich', () => ({
  enrichCompany: async (domain: string) =>
    domain === 'gov.com'
      ? { industry: 'Government', headcount: 5000, revenue: '$50M', geography: 'EU', fundingStage: 'Public', techStack: ['SAP'], dataQualityScore: 0.9, sources: ['mock'] }
      : { industry: 'Software', headcount: 200, revenue: '$10M', geography: 'US', fundingStage: 'Series B', techStack: ['AWS'], dataQualityScore: 0.85, sources: ['mock'] },
}));

vi.mock('../../db/client', () => ({
  prisma: {
    enrichmentIcpSnapshot: {
      findUnique: async () => ({
        firmographics: { industries: ['Software'], employee_min: 50, employee_max: 500 },
        technographics: {},
        signals: {},
        exclusions: { industries: ['Government'] },
      }),
      upsert: async () => ({}),
    },
    enrichmentCache: { findUnique: async () => null, upsert: async () => ({}) },
    enrichedAccount: { upsert: async (args: { create: { accountId: string } }) => ({ id: `ea_${args.create.accountId}` }) },
    qualificationResult: { upsert: async () => ({}) },
    enrichmentJob: { create: async () => ({ id: 'ej_1' }), update: async () => ({}), findFirst: async () => null },
  },
}));

import { withCapturedEvents } from '../../events';
import { assertMatchesCatalog } from '../contract';
import engine from './index';
import { runEnrichment } from './service';
import { qualifyRuleBased } from './qualify';

const icp = { industries: ['Software'], employeeMin: 50, employeeMax: 500, excludedIndustries: ['Government'] };

describe('enrichment-engine', () => {
  it('matches the event catalog', () => {
    expect(() => assertMatchesCatalog(engine)).not.toThrow();
  });

  it('qualifyRuleBased qualifies a fitting account', () => {
    const r = qualifyRuleBased({ domain: 'a.com', name: 'A', industry: 'Software', headcount: 200, geography: 'US', techStack: [] }, icp);
    expect(r.qualified).toBe(true);
    expect(r.confidence).toBe(1);
  });

  it('qualifyRuleBased disqualifies an excluded industry', () => {
    const r = qualifyRuleBased({ domain: 'g.com', name: 'G', industry: 'Government', headcount: 5000, geography: 'EU', techStack: [] }, icp);
    expect(r.qualified).toBe(false);
    expect(r.disqualifyingFactors.length).toBeGreaterThan(0);
  });

  it('runEnrichment enriches, qualifies, and publishes accounts.enriched', async () => {
    const published = await withCapturedEvents(async () => {
      await runEnrichment({
        workspaceId: 'ws_1', jobId: 'ej_1', sourceJobId: 'tam_1', icpId: 'icp_1',
        accounts: [{ id: 'a1', domain: 'acme.com', name: 'Acme' }, { id: 'a2', domain: 'gov.com', name: 'Gov' }],
        correlationId: 'corr_1',
      });
    });
    const enriched = published.find((e) => e.type === 'accounts.enriched');
    expect(enriched).toBeDefined();
    const p = enriched!.payload as { enriched: number; qualified_count: number; disqualified_count: number };
    expect(p.enriched).toBe(2);
    expect(p.qualified_count).toBe(1);
    expect(p.disqualified_count).toBe(1);
    expect(published.some((e) => e.type === 'enrichment.failed')).toBe(false);
  });
});
