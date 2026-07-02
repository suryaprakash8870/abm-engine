/**
 * Prospeo client — contact sourcing + email reveal (Engine 06), an Apollo
 * alternative the client already uses (https://app.prospeo.io).
 *
 * Exposes the SAME shape as the Apollo client (`searchPeople` / `verifyEmail`) so
 * the Contact Engine can swap providers with a single import. Wiring lives in
 * `contact-provider.ts`, which prefers Prospeo when enabled and falls back to
 * Apollo/mock on any error — so nothing here can break the pipeline.
 *
 * ENABLE: set CONTACT_SOURCE=prospeo AND PROSPEO_API_KEY. Unset either → this
 * client is dormant and the app behaves exactly as before (full rollback = remove
 * the env vars; no code change).
 *
 * APPROACH (credit-efficient): per account we do ONE company search (1 credit,
 * returns up to 25 real people with titles), classify them into the buying
 * committee locally, then enrich only a few to reveal verified emails (1 credit
 * each). The result is cached per domain, so the Contact Engine's three per-role
 * calls share it (0 extra credits). ~1 + a few credits per account.
 *
 * CREDITS: on the FREE plan (100/month) you can't be billed — worst case the
 * month's credits run out. A hard in-process budget (PROSPEO_CREDIT_BUDGET,
 * default 40) caps a single session; once hit, calls throw and the caller degrades
 * to mock.
 *
 * @see https://prospeo.io/api-docs/search-person · /api-docs/enrich-person
 */

import type { ApolloPerson, EmailVerifyResult, ApolloSearchParams, ApolloCompany, ApolloSearchPage } from './apollo';

type Role = 'decision_maker' | 'champion' | 'influencer';

const BASE = 'https://api.prospeo.io';
const DEBUG = process.env.PROSPEO_DEBUG === '1';

export function shouldUseProspeo(): boolean {
  return process.env.CONTACT_SOURCE === 'prospeo' && !!process.env.PROSPEO_API_KEY;
}

// ── Credit budget guard (per worker process) ─────────────────────────────────

export class ProspeoBudgetError extends Error {
  constructor(msg: string) { super(msg); this.name = 'ProspeoBudgetError'; }
}
export class ProspeoApiError extends Error {
  constructor(msg: string) { super(msg); this.name = 'ProspeoApiError'; }
}

let creditsUsed = 0;
function budget(): number {
  // Conservative default for a 100-credit/month free plan: cap one session at 40
  // (~6-8 accounts) so a stray "Source all" leaves most of the month in reserve.
  const n = Number(process.env.PROSPEO_CREDIT_BUDGET);
  return Number.isFinite(n) && n > 0 ? n : 40;
}
/** Reserve `n` credits up-front (used for searches, which bill on any match). */
function reserve(n: number): void {
  if (creditsUsed + n > budget()) {
    throw new ProspeoBudgetError(`Prospeo credit budget reached (${creditsUsed}/${budget()}).`);
  }
  creditsUsed += n;
}
/** Throw if already at the cap — for calls we only charge for on success (enrich). */
function checkBudget(): void {
  if (creditsUsed >= budget()) throw new ProspeoBudgetError(`Prospeo credit budget reached (${creditsUsed}/${budget()}).`);
}
/** Count an ACTUAL charge — Prospeo bills per email/record found, not per attempt. */
function spend(n = 1): void { creditsUsed += n; }
/** Credits spent this process — surfaced by the test script + health. */
export function prospeoCreditsUsed(): number { return creditsUsed; }

// ── HTTP ─────────────────────────────────────────────────────────────────────

async function post(path: string, body: unknown, attempt = 0): Promise<Record<string, unknown>> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20_000);
  try {
    const res = await fetch(`${BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-KEY': process.env.PROSPEO_API_KEY ?? '' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (DEBUG) console.log(JSON.stringify({ level: 'debug', component: 'prospeo', path, status: res.status, error_code: json.error_code ?? null }));
    // Transient rate limit → back off and retry rather than failing to mock.
    if (res.status === 429 && attempt < 5) {
      clearTimeout(timer);
      await new Promise((r) => setTimeout(r, 1200 * (attempt + 1)));
      return post(path, body, attempt + 1);
    }
    if (!res.ok || json.error === true) {
      throw new ProspeoApiError(`Prospeo ${path} ${res.status}: ${String(json.error_code ?? JSON.stringify(json).slice(0, 200))}`);
    }
    return json;
  } finally {
    clearTimeout(timer);
  }
}

// ── Response parsing (defensive — shapes vary by plan/version) ────────────────

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** Pull the array of matched people out of a /search-person response. */
function extractPeople(json: Record<string, unknown>): Array<Record<string, unknown>> {
  const r = (json.response ?? json) as Record<string, unknown>;
  const candidate = (r.results ?? r.people ?? r.data ?? json.results) as unknown;
  if (!Array.isArray(candidate)) return [];
  return candidate.map((it) => {
    const o = it as Record<string, unknown>;
    return (o.person ?? o) as Record<string, unknown>;
  });
}

function personIdentity(p: Record<string, unknown>): { id: string | null; linkedin: string | null; name: string | null; title: string | null } {
  return {
    id: str(p.person_id) ?? str(p.id),
    linkedin: str(p.linkedin_url) ?? str(p.linkedin),
    name: str(p.full_name) ?? str(p.name),
    // Prospeo search results carry the title as `current_job_title`.
    title: str(p.current_job_title) ?? str(p.job_title) ?? str(p.title),
  };
}

/** Reveal a verified email for one person via /enrich-person (1 credit if found).
 *  LinkedIn URL is the most reliable identifier; person_id is the fallback. Skips
 *  (returns null email) on an API error so one bad record can't fail the account. */
async function enrichEmail(idn: { id: string | null; linkedin: string | null }): Promise<{ email: string | null; company: Record<string, unknown> | null }> {
  const data: Record<string, unknown> = {};
  if (idn.linkedin) data.linkedin_url = idn.linkedin;
  else if (idn.id) data.person_id = idn.id;
  else return { email: null, company: null };

  checkBudget(); // stop at the cap; charge only when an email is actually revealed
  try {
    const json = await post('/enrich-person', { only_verified_email: true, data });
    const person = (json.person ?? null) as Record<string, unknown> | null;
    const emailObj = (person?.email ?? null) as Record<string, unknown> | null;
    const email = str(emailObj?.email);
    if (email) spend(1);
    return { email, company: (json.company ?? null) as Record<string, unknown> | null };
  } catch (e) {
    if (e instanceof ProspeoBudgetError) throw e;
    return { email: null, company: null };
  }
}

// ── Local classifiers (kept here to avoid a client→engine layer inversion) ────

function roleOf(title: string): Role {
  const t = title.toLowerCase();
  if (/\b(ceo|cto|cfo|cmo|cio|coo|svp|evp|vp)\b|chief|vice president|head of|founder|owner|president/.test(t)) return 'decision_maker';
  if (/director|senior manager/.test(t)) return 'champion';
  return 'influencer';
}
function seniorityOf(title: string): string | null {
  const t = title.toLowerCase();
  if (/\b(ceo|cto|cfo|cmo|cio|coo)\b|chief|founder/.test(t)) return 'c_suite';
  if (/\bvp\b|vice president|head of/.test(t)) return 'vp';
  if (/director/.test(t)) return 'director';
  if (/manager|lead/.test(t)) return 'manager';
  return null;
}

// ── Per-domain committee (built once, shared across the 3 per-role calls) ─────

interface CommitteeMember extends ApolloPerson { role: Role }
const committeeCache = new Map<string, CommitteeMember[]>();

function maxPerRole(): number {
  const n = Number(process.env.PROSPEO_MAX_PER_ROLE);
  return Number.isFinite(n) && n > 0 ? n : 2;
}

/** One company search → classify → enrich a balanced few → the buying committee. */
async function buildCommittee(domain: string): Promise<CommitteeMember[]> {
  reserve(1); // search bills 1 credit per request returning ≥1 person
  let search: Record<string, unknown>;
  try {
    search = await post('/search-person', {
      page: 1,
      filters: { company: { websites: { include: [domain] } } },
    });
  } catch (e) {
    if (e instanceof ProspeoApiError && /NO_RESULTS/.test(e.message)) return [];
    throw e;
  }

  // Classify everyone by their real title, keep a balanced set to cap enrichment.
  const cap = maxPerRole();
  const buckets: Record<Role, Array<{ idn: ReturnType<typeof personIdentity>; title: string }>> = {
    decision_maker: [], champion: [], influencer: [],
  };
  for (const p of extractPeople(search)) {
    const idn = personIdentity(p);
    if (!idn.linkedin && !idn.id) continue;
    const title = idn.title ?? '';
    const role = roleOf(title);
    if (buckets[role].length < cap) buckets[role].push({ idn, title });
  }

  // Enrich only the picked committee to reveal verified emails.
  const out: CommitteeMember[] = [];
  for (const role of ['decision_maker', 'champion', 'influencer'] as const) {
    for (const { idn, title } of buckets[role]) {
      const { email, company } = await enrichEmail(idn);
      if (!email) continue;
      out.push({
        apolloId: idn.id ?? `prospeo_${email}`,
        fullName: idn.name ?? email.split('@')[0],
        title,
        seniority: seniorityOf(title),
        department: str((company as Record<string, unknown> | null)?.industry),
        linkedinUrl: idn.linkedin,
        email,
        role,
      });
    }
  }
  return out;
}

// ── Public API (Apollo-compatible) ───────────────────────────────────────────

/**
 * Return the committee members matching the role these titles represent. The
 * heavy lifting (search + enrich) happens once per domain and is cached, so the
 * Contact Engine's three per-role calls only spend credits on the first.
 */
export async function searchPeople(
  domain: string,
  _companyName: string,
  titles: string[],
  limit: number,
): Promise<ApolloPerson[]> {
  if (titles.length === 0 || limit <= 0) return [];
  if (!committeeCache.has(domain)) committeeCache.set(domain, await buildCommittee(domain));
  const committee = committeeCache.get(domain) ?? [];
  const wantRole = roleOf(titles[0]); // which role this call is sourcing
  return committee
    .filter((p) => p.role === wantRole)
    .slice(0, limit)
    .map(({ role, ...rest }) => { void role; return rest; });
}

/**
 * Verify an email. Prospeo reveals only VERIFIED emails during enrichment
 * (only_verified_email:true), so an address that came from searchPeople is already
 * deliverable — we mark it valid without spending another credit.
 */
export async function verifyEmail(email: string | null): Promise<EmailVerifyResult> {
  if (!email) return { status: 'invalid', bounceRisk: 1 };
  return { status: 'valid', bounceRisk: 0.05 };
}

// ── Company enrichment (real firmographics for scoring) ──────────────────────

export interface ProspeoCompanyData {
  name: string | null;
  industry: string | null;
  headcount: number | null;
  revenue: string | null;
  geography: string | null;
  fundingStage: string;
  techStack: string[];
}

function extractTech(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((t) => (typeof t === 'string' ? t : (str((t as Record<string, unknown>).name) ?? str((t as Record<string, unknown>).technology) ?? str((t as Record<string, unknown>).value))))
    .filter((s): s is string => !!s)
    .slice(0, 25);
}

// ── Company SEARCH (TAM discovery) + shared firmographic cache ───────────────

/** Filled during a search so the enrichment step can reuse the firmographics for
 *  free (search-company returns them inline). Keyed by website domain. */
const firmographicCache = new Map<string, ProspeoCompanyData>();
export function cachedFirmographics(domain: string): ProspeoCompanyData | undefined {
  return firmographicCache.get(domain.trim().toLowerCase().replace(/^www\./, ''));
}

// Valid Prospeo headcount buckets (per Filters Documentation).
const HEADCOUNT_BUCKETS: Array<[number, number, string]> = [
  [1, 10, '1-10'], [11, 20, '11-20'], [21, 50, '21-50'], [51, 100, '51-100'], [101, 200, '101-200'],
  [201, 500, '201-500'], [501, 1000, '501-1000'], [1001, 2000, '1001-2000'], [2001, 5000, '2001-5000'],
  [5001, 10000, '5001-10000'], [10001, Number.POSITIVE_INFINITY, '10000+'],
];
function headcountBuckets(min: number, max: number): string[] {
  return HEADCOUNT_BUCKETS.filter(([lo, hi]) => hi >= min && lo <= max).map(([, , b]) => b);
}

// Map ICP industries → Prospeo company_industry values. Default to product/software
// companies (best contact coverage); only add IT services/consulting when the ICP
// actually targets it — those firms (staffing/consulting) often have sparse contacts.
function mapIndustries(icpIndustries: string[]): string[] {
  const t = icpIndustries.join(' ').toLowerCase();
  const out: string[] = [];
  if (/soft|saas|cyber|secur|cloud|tech|internet|data|platform|develop|product|\bit\b|information/.test(t) || icpIndustries.length === 0) {
    out.push('Software Development');
  }
  if (/service|consult|staffing|agency|outsourc/.test(t)) {
    out.push('IT Services and IT Consulting');
  }
  return out.length ? out : ['Software Development'];
}

function domainFromWebsite(website: string, fallback: string): string {
  const d = website.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '').toLowerCase();
  return d || fallback.toLowerCase() || 'unknown.com';
}

function companyToFirmographics(c: Record<string, unknown>): { domain: string; company: ApolloCompany; data: ProspeoCompanyData } {
  const domain = domainFromWebsite(str(c.website) ?? '', str(c.domain) ?? '');
  const loc = c.location as Record<string, unknown> | null;
  const data: ProspeoCompanyData = {
    name: str(c.name),
    industry: str(c.industry),
    headcount: typeof c.employee_count === 'number' ? c.employee_count : null,
    revenue: str(c.revenue_range_printed) ?? str(c.revenue_range),
    geography: str(loc?.country),
    fundingStage: (str(c.type) ?? '').toLowerCase().includes('public') ? 'public' : 'private',
    techStack: extractTech(c.technology),
  };
  return {
    domain,
    data,
    company: { domain, name: data.name ?? domain, apolloId: str(c.company_id) ?? '', industry: data.industry, employees: data.headcount, geography: data.geography },
  };
}

/**
 * Find real companies matching an ICP (Apollo-compatible shape). Serves ONE page
 * (25 companies) for 1 credit and caches each company's firmographics so the
 * enrichment step reuses them free. Returns hasMore:false to cap credit spend.
 */
export async function searchCompanies(params: ApolloSearchParams, page: number, perPage = 25, _accountLimit = 1000): Promise<ApolloSearchPage> {
  const filters: Record<string, unknown> = { company_industry: { include: mapIndustries(params.industries) } };
  const buckets = headcountBuckets(params.employeeMin || 1, params.employeeMax || 100000);
  if (buckets.length) filters.company_headcount_range = buckets;

  reserve(1);
  let json: Record<string, unknown>;
  try {
    json = await post('/search-company', { page, filters });
  } catch (e) {
    if (e instanceof ProspeoApiError && /NO_RESULTS/.test(e.message)) return { companies: [], total: 0, page, perPage, hasMore: false, raw: {} };
    throw e;
  }
  const arr = (json.results ?? (json.response as Record<string, unknown>)?.results ?? []) as unknown;
  const rows = Array.isArray(arr) ? arr.map((it) => ((it as Record<string, unknown>).company ?? it) as Record<string, unknown>) : [];
  const companies: ApolloCompany[] = [];
  for (const c of rows) {
    const { domain, company, data } = companyToFirmographics(c);
    firmographicCache.set(domain, data);
    companies.push(company);
  }
  const total = Number((json.pagination as Record<string, unknown> | undefined)?.total_count ?? companies.length);
  return { companies, total, page, perPage, hasMore: false, raw: json };
}

/** Real firmographics + technographics for one company (1 credit; free re-enrich in 90d). */
export async function enrichCompany(domain: string): Promise<ProspeoCompanyData | null> {
  checkBudget();
  try {
    const json = await post('/enrich-company', { data: { company_website: domain } });
    const c = (json.company ?? null) as Record<string, unknown> | null;
    if (!c) return null;
    spend(1); // charged on a match
    const type = (str(c.type) ?? '').toLowerCase();
    return {
      name: str(c.name),
      industry: str(c.industry),
      headcount: typeof c.employee_count === 'number' ? c.employee_count : null,
      revenue: str(c.revenue_range_printed) ?? str(c.revenue_range),
      geography: str((c.location as Record<string, unknown> | null)?.country),
      fundingStage: type.includes('public') ? 'public' : 'private',
      techStack: extractTech(c.technology),
    };
  } catch (e) {
    if (e instanceof ProspeoBudgetError) throw e;
    return null;
  }
}
