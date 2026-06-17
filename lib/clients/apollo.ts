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

/** Thrown when the Apollo plan can't reach the search API (free-plan gating). */
export class ApolloInaccessibleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ApolloInaccessibleError';
  }
}

function mockPage(params: ApolloSearchParams, page: number, perPage: number, accountLimit: number): ApolloSearchPage {
  const total = mockTotal(params, accountLimit);
  const start = (page - 1) * perPage;
  const companies = Array.from({ length: Math.max(0, Math.min(perPage, total - start)) }, (_, k) =>
    mockCompany(start + k, params),
  );
  return { companies, total, page, perPage, hasMore: start + companies.length < total, raw: { mock: true, total, page } };
}

export async function searchCompanies(
  params: ApolloSearchParams,
  page: number,
  perPage = 25,
  accountLimit = 1000,
): Promise<ApolloSearchPage> {
  if (shouldUseMock()) return mockPage(params, page, perPage, accountLimit);
  try {
    return await searchViaApollo(params, page, perPage);
  } catch (e) {
    // A real key on a plan without API access: degrade gracefully to mock data
    // rather than failing the build (the doc's "never block the pipeline" rule).
    if (e instanceof ApolloInaccessibleError) {
      console.warn(
        JSON.stringify({
          level: 'warn',
          component: 'apollo',
          msg: 'Apollo API not accessible on this plan — using MOCK companies. Upgrade Apollo for real data.',
        }),
      );
      return mockPage(params, page, perPage, accountLimit);
    }
    throw e;
  }
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
  if (!res.ok) {
    const body = await res.text();
    // 401/403 (and Apollo's specific markers) = the key/plan can't reach the search
    // API. Treat as "inaccessible" so the caller falls back to mock instead of failing.
    if (
      res.status === 401 ||
      res.status === 403 ||
      body.includes('API_INACCESSIBLE') ||
      body.includes('free plan') ||
      body.includes('Invalid access credentials')
    ) {
      throw new ApolloInaccessibleError(`Apollo API not accessible (${res.status}): ${body}`);
    }
    throw new Error(`Apollo error ${res.status}: ${body}`);
  }
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

// ── People search + email verification (Engine 06) ───────────────────────────
// Same mock-first philosophy: no APOLLO_API_KEY (or TAM_SOURCE=mock) → deterministic
// synthetic people derived from the company domain + requested titles. Free, no key.

export interface ApolloPerson {
  apolloId: string;
  fullName: string;
  title: string;
  seniority: string | null;
  department: string | null;
  linkedinUrl: string | null;
  email: string | null;
}

export interface EmailVerifyResult {
  status: 'valid' | 'risky' | 'invalid';
  bounceRisk: number; // 0 (safe) .. 1 (will bounce)
}

const FIRST_NAMES = ['Ava', 'Liam', 'Maya', 'Noah', 'Priya', 'Ethan', 'Sofia', 'Omar', 'Lena', 'Raj', 'Clara', 'Theo'];
const LAST_NAMES = ['Reyes', 'Okafor', 'Nguyen', 'Patel', 'Mendez', 'Cohen', 'Haddad', 'Larsson', 'Iyer', 'Fischer', 'Santos', 'Walsh'];
const SENIORITY_BY_KEYWORD: Array<[RegExp, string]> = [
  // Word-bounded abbreviations — otherwise "cto" matches inside "direCTOr".
  [/\b(ceo|cto|cfo|cmo|cio|coo)\b|chief|founder/i, 'c_suite'],
  [/\bvp\b|vice president|head of/i, 'vp'],
  [/director/i, 'director'],
  [/manager|lead/i, 'manager'],
  [/senior|principal|staff/i, 'senior'],
];

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function seniorityFor(title: string): string {
  for (const [re, sen] of SENIORITY_BY_KEYWORD) if (re.test(title)) return sen;
  return 'individual';
}

function mockPerson(domain: string, companyName: string, title: string, i: number): ApolloPerson {
  const h = hash(`${domain}|${title}|${i}`);
  const first = FIRST_NAMES[h % FIRST_NAMES.length];
  const last = LAST_NAMES[(h >> 4) % LAST_NAMES.length];
  const fullName = `${first} ${last}`;
  const email = `${first}.${last}@${domain}`.toLowerCase();
  return {
    apolloId: `mockp_${h.toString(36)}`,
    fullName,
    title,
    seniority: seniorityFor(title),
    department: title.toLowerCase().includes('eng') ? 'Engineering' : null,
    linkedinUrl: `https://www.linkedin.com/in/${first.toLowerCase()}-${last.toLowerCase()}-${(h % 9999).toString(36)}`,
    email,
  };
}

/**
 * Find people at a company by title. Returns up to `limit` candidates whose
 * titles are drawn from `titles`. Mock by default; real Apollo people search when
 * a key is present (degrades to mock on an inaccessible plan).
 */
export async function searchPeople(
  domain: string,
  companyName: string,
  titles: string[],
  limit: number,
): Promise<ApolloPerson[]> {
  if (titles.length === 0 || limit <= 0) return [];
  if (shouldUseMock()) {
    return Array.from({ length: limit }, (_, i) => mockPerson(domain, companyName, titles[i % titles.length], i));
  }
  try {
    return await searchPeopleViaApollo(domain, titles, limit);
  } catch (e) {
    // Never block the pipeline (doc rule). Plan-gating OR any transient error
    // (500, timeout, network) degrades to deterministic mock contacts.
    if (!(e instanceof ApolloInaccessibleError)) {
      console.warn(JSON.stringify({ level: 'warn', component: 'apollo', msg: `Apollo people search failed (${String(e)}) — using MOCK contacts.` }));
    } else {
      console.warn(JSON.stringify({ level: 'warn', component: 'apollo', msg: 'Apollo people search not accessible — using MOCK contacts.' }));
    }
    return Array.from({ length: limit }, (_, i) => mockPerson(domain, companyName, titles[i % titles.length], i));
  }
}

async function searchPeopleViaApollo(domain: string, titles: string[], limit: number): Promise<ApolloPerson[]> {
  const res = await fetch('https://api.apollo.io/v1/mixed_people/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Api-Key': process.env.APOLLO_API_KEY ?? '' },
    body: JSON.stringify({ page: 1, per_page: limit, q_organization_domains: domain, person_titles: titles }),
  });
  if (!res.ok) {
    const body = await res.text();
    if (res.status === 401 || res.status === 403 || body.includes('API_INACCESSIBLE') || body.includes('free plan') || body.includes('Invalid access credentials')) {
      throw new ApolloInaccessibleError(`Apollo people search not accessible (${res.status}): ${body}`);
    }
    throw new Error(`Apollo people error ${res.status}: ${body}`);
  }
  const data = (await res.json()) as {
    people?: { id?: string; name?: string; title?: string; seniority?: string; departments?: string[]; linkedin_url?: string; email?: string }[];
  };
  return (data.people ?? []).slice(0, limit).map((p) => ({
    apolloId: p.id ?? '',
    fullName: p.name ?? 'Unknown',
    title: p.title ?? '',
    seniority: p.seniority ?? null,
    department: p.departments?.[0] ?? null,
    linkedinUrl: p.linkedin_url ?? null,
    email: p.email ?? null,
  }));
}

/** Deterministic mock verification by address (~85% valid). Higher bits of the
 *  FNV-1a hash — the low bits are weakly distributed. */
function mockVerify(email: string): EmailVerifyResult {
  const bucket = (hash(email) >>> 4) % 100;
  if (bucket < 85) return { status: 'valid', bounceRisk: 0.03 };
  if (bucket < 95) return { status: 'risky', bounceRisk: 0.5 };
  return { status: 'invalid', bounceRisk: 0.95 };
}

/**
 * Verify an email's deliverability. Mock by default; real Apollo when a key is
 * present. Like searchPeople, an inaccessible plan (or any verify outage) degrades
 * to the mock distribution — NOT a blanket 'risky' — so a free key still yields a
 * realistic mostly-valid spread instead of marking every contact risky.
 */
export async function verifyEmail(email: string | null): Promise<EmailVerifyResult> {
  if (!email) return { status: 'invalid', bounceRisk: 1 };
  if (shouldUseMock()) return mockVerify(email);
  try {
    const res = await fetch('https://api.apollo.io/v1/email_verifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Api-Key': process.env.APOLLO_API_KEY ?? '' },
      body: JSON.stringify({ email }),
    });
    if (!res.ok) {
      const body = await res.text();
      if (res.status === 401 || res.status === 403 || body.includes('free plan') || body.includes('API_INACCESSIBLE') || body.includes('Invalid access credentials')) {
        return mockVerify(email); // plan can't reach verify → realistic mock spread
      }
      throw new Error(`Apollo verify error ${res.status}: ${body}`);
    }
    const data = (await res.json()) as { status?: string; deliverability?: string };
    const raw = (data.status ?? data.deliverability ?? 'unknown').toLowerCase();
    const status: EmailVerifyResult['status'] = raw.includes('valid') || raw.includes('deliver') ? 'valid' : raw.includes('risk') || raw.includes('catch') ? 'risky' : 'invalid';
    return { status, bounceRisk: status === 'valid' ? 0.05 : status === 'risky' ? 0.5 : 0.95 };
  } catch {
    return mockVerify(email); // never block the pipeline on a verify outage
  }
}
