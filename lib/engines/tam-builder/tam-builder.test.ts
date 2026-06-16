/**
 * Tests for the TAM Builder (engine 02).
 *  - catalog match
 *  - icpToFilters / normalizeDomain / dedupeByDomain
 *  - runTamBuild dedupes and publishes tam.search_completed (Apollo + DB mocked)
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('../../clients/apollo', () => ({
  searchCompanies: async () => ({
    companies: [
      { domain: 'acme.com', name: 'Acme', apolloId: '1', industry: 'Software', employees: 100, geography: 'US' },
      { domain: 'globex.com', name: 'Globex', apolloId: '2', industry: 'Software', employees: 200, geography: 'US' },
      { domain: 'ACME.com', name: 'Acme (dup)', apolloId: '3', industry: 'Software', employees: 100, geography: 'US' },
    ],
    total: 3,
    page: 1,
    perPage: 25,
    hasMore: false,
    raw: { mock: true },
  }),
}));

vi.mock('../../db/client', () => ({
  prisma: {
    apolloSearchResult: { create: async () => ({}) },
    searchParamsLog: { create: async () => ({}) },
    rawAccount: {
      createMany: async () => ({ count: 2 }),
      findMany: async () => [{ id: 'acc_acme' }, { id: 'acc_globex' }],
    },
    tamBuildJob: { create: async () => ({ id: 'job_1' }), update: async () => ({}), findFirst: async () => null },
  },
}));

import { withCapturedEvents } from '../../events';
import { assertMatchesCatalog } from '../contract';
import engine from './index';
import { runTamBuild, icpToFilters, normalizeDomain, dedupeByDomain } from './service';
import type { ApolloCompany } from '../../clients/apollo';

const company = (domain: string): ApolloCompany => ({ domain, name: domain, apolloId: domain, industry: null, employees: null, geography: null });

describe('tam-builder', () => {
  it('matches the event catalog', () => {
    expect(() => assertMatchesCatalog(engine)).not.toThrow();
  });

  it('icpToFilters maps the ICP firmographics onto Apollo filters', () => {
    const filters = icpToFilters({
      icp_id: 'icp_1', version: 1, mode: 'hypothesis',
      firmographics: { industries: ['Software'], employee_min: 51, employee_max: 1000, geographies: ['US'], business_model: 'B2B' },
      technographics: {}, signals: {}, exclusions: {}, confidence_score: 0.8,
    });
    expect(filters.industries).toEqual(['Software']);
    expect(filters.employeeMin).toBe(51);
    expect(filters.employeeMax).toBe(1000);
    expect(filters.geographies).toEqual(['US']);
  });

  it('normalizeDomain + dedupeByDomain', () => {
    expect(normalizeDomain('HTTPS://WWW.Acme.com/pricing')).toBe('acme.com');
    expect(dedupeByDomain([company('a.com'), company('A.com'), company('b.com')])).toHaveLength(2);
  });

  it('runTamBuild dedupes and publishes tam.search_completed', async () => {
    const published = await withCapturedEvents(async () => {
      await runTamBuild({
        workspaceId: 'ws_1', jobId: 'job_1', icpId: 'icp_1',
        filters: { industries: ['Software'], employeeMin: 51, employeeMax: 1000, geographies: ['US'] },
        accountLimit: 1000, correlationId: 'corr_1',
      });
    });
    const done = published.find((e) => e.type === 'tam.search_completed');
    expect(done).toBeDefined();
    // ACME.com deduped against acme.com → 2 unique accounts.
    expect((done!.payload as { total_found: number }).total_found).toBe(2);
    expect((done!.payload as { account_ids: string[] }).account_ids).toHaveLength(2);
    expect(published.some((e) => e.type === 'tam.search_failed')).toBe(false);
  });
});
