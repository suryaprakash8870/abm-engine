/**
 * Company enrichment client (Engine 03).
 *
 * FREE TESTING: with no APOLLO_API_KEY/CLEARBIT_API_KEY (or ENRICH_SOURCE=mock),
 * returns deterministic synthetic firmographics/technographics derived from the
 * domain. Real Apollo/Clearbit enrichment is a documented TODO that also falls
 * back to mock when the provider isn't reachable.
 */

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

export async function enrichCompany(domain: string, _name: string): Promise<EnrichmentData> {
  if (shouldUseMock()) return mockEnrich(domain);
  // TODO(integration): Apollo org enrich → Clearbit fallback → BuiltWith for tech.
  // Apollo org enrich also requires a paid plan; fall back to mock if unreachable.
  return mockEnrich(domain);
}
