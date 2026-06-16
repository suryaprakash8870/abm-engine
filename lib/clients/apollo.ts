/**
 * Apollo company-search client (Engine 02).
 *
 * FREE TESTING: set TAM_SOURCE=mock (or leave APOLLO_API_KEY unset) and search
 * returns deterministic synthetic companies derived from the ICP filters — no key,
 * no cost. Set APOLLO_API_KEY for the real Apollo API.
 */

export interface ApolloSearchParams {
  industries: string[];
  employeeMin: number;
  employeeMax: number;
  geographies: string[];
}

export interface ApolloCompany {
  domain: string;
  name: string;
  apolloId: string;
  industry: string | null;
  employees: number | null;
  geography: string | null;
}

export interface ApolloSearchPage {
  companies: ApolloCompany[];
  total: number;
  page: number;
  perPage: number;
  hasMore: boolean;
  /** Raw provider response stored for checkpoint/audit (apollo_search_results). */
  raw: unknown;
}

function shouldUseMock(): boolean {
  return process.env.TAM_SOURCE === 'mock' || !process.env.APOLLO_API_KEY;
}

// ── Mock generator ───────────────────────────────────────────────────────────

const STEMS = [
  'nimbus', 'apex', 'vertex', 'quanta', 'lumen', 'cobalt', 'zenith', 'orbit', 'flux',
  'pinnacle', 'helix', 'summit', 'cascade', 'beacon', 'arbor', 'onyx', 'keystone',
  'northwind', 'brightwave', 'clearpath', 'ironclad', 'meridian', 'solstice', 'vantage',
  'axiom', 'bluefin', 'cedar', 'dynamo', 'everest', 'forge', 'granite', 'harbor',
  'indigo', 'juniper', 'kestrel', 'lattice', 'monarch', 'novel',
];
const SUFFIXES = ['Labs', 'Systems', 'Software', 'Technologies', 'Cloud', 'AI', 'Works', 'HQ'];

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** How many synthetic companies the mock "finds" for these filters. */
function mockTotal(params: ApolloSearchParams, accountLimit: number): number {
  const base = 30 + params.industries.length * 4 + params.geographies.length * 2;
  return Math.min(accountLimit, base);
}

function mockCompany(i: number, params: ApolloSearchParams): ApolloCompany {
  const stem = STEMS[i % STEMS.length] + (i >= STEMS.length ? String(Math.floor(i / STEMS.length)) : '');
  const industry = params.industries.length ? params.industries[i % params.industries.length] : 'Software';
  const geography = params.geographies.length ? params.geographies[i % params.geographies.length] : 'North America';
  const span = Math.max(1, params.employeeMax - params.employeeMin);
  const employees = params.employeeMin + ((i * 37) % span);
  return {
    domain: `${stem}.com`,
    name: `${cap(stem)} ${SUFFIXES[i % SUFFIXES.length]}`,
    apolloId: `mock_${stem}`,
    industry,
    employees,
    geography,
  };
}

// ── Public search ────────────────────────────────────────────────────────────

export async function searchCompanies(
  params: ApolloSearchParams,
  page: number,
  perPage = 25,
  accountLimit = 1000,
): Promise<ApolloSearchPage> {
  if (shouldUseMock()) {
    const total = mockTotal(params, accountLimit);
    const start = (page - 1) * perPage;
    const companies = Array.from({ length: Math.max(0, Math.min(perPage, total - start)) }, (_, k) =>
      mockCompany(start + k, params),
    );
    return { companies, total, page, perPage, hasMore: start + companies.length < total, raw: { mock: true, total, page } };
  }
  return searchViaApollo(params, page, perPage);
}

/**
 * Real Apollo call (untested without a key). Maps filters to Apollo's
 * mixed_companies/search params. Refine the filter mapping when wiring a live key.
 */
async function searchViaApollo(params: ApolloSearchParams, page: number, perPage: number): Promise<ApolloSearchPage> {
  const res = await fetch('https://api.apollo.io/v1/mixed_companies/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Api-Key': process.env.APOLLO_API_KEY ?? '' },
    body: JSON.stringify({
      page,
      per_page: perPage,
      organization_num_employees_ranges: [`${params.employeeMin},${params.employeeMax}`],
      q_organization_keyword_tags: params.industries,
      organization_locations: params.geographies,
    }),
  });
  if (!res.ok) throw new Error(`Apollo error ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as {
    organizations?: { primary_domain?: string; name?: string; id?: string; industry?: string; estimated_num_employees?: number }[];
    pagination?: { total_entries?: number };
  };
  const companies: ApolloCompany[] = (data.organizations ?? [])
    .filter((o) => o.primary_domain)
    .map((o) => ({
      domain: o.primary_domain as string,
      name: o.name ?? (o.primary_domain as string),
      apolloId: o.id ?? '',
      industry: o.industry ?? null,
      employees: o.estimated_num_employees ?? null,
      geography: null,
    }));
  const total = data.pagination?.total_entries ?? companies.length;
  return { companies, total, page, perPage, hasMore: page * perPage < total, raw: data };
}
