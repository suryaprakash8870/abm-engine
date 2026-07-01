/**
 * Company enrichment client (Engine 03).
 *
 * FREE TESTING: with no APOLLO_API_KEY/CLEARBIT_API_KEY (or ENRICH_SOURCE=mock),
 * returns deterministic synthetic firmographics/technographics derived from the
 * domain. Real Apollo/Clearbit enrichment is a documented TODO that also falls
 * back to mock when the provider isn't reachable.
 */

import { cachedFirmographics, enrichCompany as prospeoEnrichCompany } from './prospeo';
import { pdlEnrichCompany, shouldUsePdl } from './pdl';

export interface EnrichmentData {
  industry: string | null;
  headcount: number | null;
  revenue: string | null;
  geography: string | null;
  fundingStage: string | null;
  techStack: string[];
  dataQualityScore: number;
  sources: string[];
}

function shouldUseMock(): boolean {
  return process.env.ENRICH_SOURCE === 'mock' || (!process.env.APOLLO_API_KEY && !process.env.CLEARBIT_API_KEY);
}

const INDUSTRIES = ['Software', 'Information Technology', 'Financial Services', 'Healthcare', 'E-commerce', 'Manufacturing', 'Cybersecurity', 'Cloud Infrastructure'];
const TECH = ['HubSpot', 'Salesforce', 'Segment', 'Snowflake', 'AWS', 'Kubernetes', 'Datadog', 'Stripe', 'GitHub', 'Outreach'];
const FUNDING = ['Seed', 'Series A', 'Series B', 'Series C', 'Series D', 'Public'];
const GEOS = ['North America', 'Europe', 'Asia Pacific'];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function mockEnrich(domain: string): EnrichmentData {
  const h = hash(domain);
  // Use UNSIGNED shifts: signed >> can go negative for h > 2^31 → negative index → undefined.
  const tech = [TECH[h % TECH.length], TECH[(h >>> 3) % TECH.length], TECH[(h >>> 6) % TECH.length]]
    .filter((v): v is string => Boolean(v))
    .filter((v, i, a) => a.indexOf(v) === i);
  return {
    industry: INDUSTRIES[h % INDUSTRIES.length],
    headcount: 50 + (h % 1950),
    revenue: `$${1 + (h % 50)}M`,
    geography: GEOS[h % GEOS.length],
    fundingStage: FUNDING[h % FUNDING.length],
    techStack: tech,
    dataQualityScore: Math.round((0.7 + (h % 30) / 100) * 100) / 100,
    sources: ['mock'],
  };
}

function useProspeoEnrich(): boolean {
  return process.env.TAM_SOURCE === 'prospeo' && !!process.env.PROSPEO_API_KEY;
}

export async function enrichCompany(domain: string, _name: string): Promise<EnrichmentData> {
  // Prefer PDL — its own free-credit pool, real firmographics + tech tags — so it
  // doesn't drain Prospeo. Misses (404 / budget cap) fall through.
  if (shouldUsePdl()) {
    const p = await pdlEnrichCompany(domain);
    if (p) return { industry: p.industry, headcount: p.headcount, revenue: p.revenue, geography: p.geography, fundingStage: p.fundingStage, techStack: p.techStack, dataQualityScore: 0.95, sources: ['pdl'] };
  }
  // Real firmographics via Prospeo: reuse what the TAM search already fetched for
  // this domain (free), else a live enrich-company. Falls back to mock otherwise.
  if (useProspeoEnrich()) {
    const fm = cachedFirmographics(domain) ?? (await prospeoEnrichCompany(domain).catch(() => null));
    if (fm) {
      return { industry: fm.industry, headcount: fm.headcount, revenue: fm.revenue, geography: fm.geography, fundingStage: fm.fundingStage, techStack: fm.techStack, dataQualityScore: 0.95, sources: ['prospeo'] };
    }
  }
  if (shouldUseMock()) return mockEnrich(domain);
  return mockEnrich(domain);
}
