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
 * CREDITS (real money): search = 1 credit/request (≤25 people, emails hidden);
 * enrich = 1 credit/verified email revealed. A hard in-process budget
 * (PROSPEO_CREDIT_BUDGET, default 100) caps spend so a stray "Source all Tier 1"
 * can't drain the account — once hit, calls throw and the caller falls back to mock.
 *
 * @see https://prospeo.io/api-docs/search-person · /api-docs/enrich-person
 */

import type { ApolloPerson, EmailVerifyResult } from './apollo';

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
  const n = Number(process.env.PROSPEO_CREDIT_BUDGET);
  return Number.isFinite(n) && n > 0 ? n : 100;
}
/** Reserve `n` credits or throw so the caller degrades to mock instead of overspending. */
function reserve(n: number): void {
  if (creditsUsed + n > budget()) {
    throw new ProspeoBudgetError(`Prospeo credit budget reached (${creditsUsed}/${budget()}) — falling back to mock.`);
  }
  creditsUsed += n;
}
/** Credits spent this process — surfaced by the test script + health. */
export function prospeoCreditsUsed(): number { return creditsUsed; }

// ── HTTP ─────────────────────────────────────────────────────────────────────

async function post(path: string, body: unknown): Promise<Record<string, unknown>> {
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
    if (DEBUG) console.log(JSON.stringify({ level: 'debug', component: 'prospeo', path, status: res.status, body: json }));
    if (!res.ok || json.error === true) {
      throw new ProspeoApiError(`Prospeo ${path} ${res.status}: ${JSON.stringify(json).slice(0, 300)}`);
    }
    return json;
  } finally {
    clearTimeout(timer);
  }
}

// ── Defensive response parsing (shapes vary slightly by plan/version) ─────────

/** Pull the array of matched people out of a /search-person response. */
function extractPeople(json: Record<string, unknown>): Array<Record<string, unknown>> {
  const r = (json.response ?? json) as Record<string, unknown>;
  const candidate = (r.people ?? r.results ?? r.data ?? (json as Record<string, unknown>).results) as unknown;
  if (Array.isArray(candidate)) {
    // Each item may be the person directly or wrap it under `person`.
    return candidate.map((it) => {
      const o = it as Record<string, unknown>;
      return (o.person ?? o) as Record<string, unknown>;
    });
  }
  return [];
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

function personIdentity(p: Record<string, unknown>): { id: string | null; linkedin: string | null; name: string | null; title: string | null } {
  return {
    id: str(p.person_id) ?? str(p.id),
    linkedin: str(p.linkedin_url) ?? str(p.linkedin),
    name: str(p.full_name) ?? str(p.name),
    title: str(p.job_title) ?? str(p.title),
  };
}

/** Reveal a verified email for one identity via /enrich-person (1 credit if found). */
async function enrichEmail(identity: { id: string | null; linkedin: string | null; name: string | null }): Promise<{ email: string | null; company: Record<string, unknown> | null; person: Record<string, unknown> | null }> {
  const data: Record<string, unknown> = {};
  if (identity.id) data.person_id = identity.id;
  else if (identity.linkedin) data.linkedin_url = identity.linkedin;
  else return { email: null, company: null, person: null };

  reserve(1); // enrich bills 1 credit per email found (no charge if none — best-effort)
  const json = await post('/enrich-person', { only_verified_email: true, data });
  const person = (json.person ?? null) as Record<string, unknown> | null;
  const emailObj = (person?.email ?? null) as Record<string, unknown> | null;
  const email = str(emailObj?.email);
  return { email, company: (json.company ?? null) as Record<string, unknown> | null, person };
}

// ── Public API (Apollo-compatible) ───────────────────────────────────────────

const seniorityOf = (title: string): string | null => {
  const t = title.toLowerCase();
  if (/\b(ceo|cto|cfo|cmo|cio|coo)\b|chief|founder/.test(t)) return 'c_suite';
  if (/\bvp\b|vice president|head of/.test(t)) return 'vp';
  if (/director/.test(t)) return 'director';
  if (/manager|lead/.test(t)) return 'manager';
  return null;
};

/**
 * Find people at a company by title and reveal their verified emails.
 * search-person (1 credit) → enrich-person per result (1 credit/email). Returns
 * only people whose verified email was revealed. Throws on API/budget error so
 * the provider shim falls back to Apollo/mock.
 */
export async function searchPeople(
  domain: string,
  companyName: string,
  titles: string[],
  limit: number,
): Promise<ApolloPerson[]> {
  if (titles.length === 0 || limit <= 0) return [];

  reserve(1); // search bills 1 credit per request returning ≥1 person
  const search = await post('/search-person', {
    page: 1,
    // NOTE: verify these filter keys against your account on the first live run
    // (see scripts/prospeo-test.ts) — adjust here if the API rejects them.
    filters: {
      company_website: [domain],
      person_job_title: { include: titles },
    },
  });

  const people = extractPeople(search).slice(0, limit);
  const out: ApolloPerson[] = [];
  for (const raw of people) {
    const idn = personIdentity(raw);
    const { email, company } = await enrichEmail(idn);
    if (!email) continue; // no verified email → skip (can't push/verify)
    const title = idn.title ?? '';
    out.push({
      apolloId: idn.id ?? `prospeo_${email}`,
      fullName: idn.name ?? email.split('@')[0],
      title,
      seniority: seniorityOf(title),
      department: str((company as Record<string, unknown> | null)?.industry) ?? null,
      linkedinUrl: idn.linkedin,
      email,
    });
  }
  return out;
}

/**
 * Verify an email. Prospeo reveals only VERIFIED emails during enrichment
 * (only_verified_email:true), so an address that came from searchPeople is already
 * deliverable — we mark it valid without spending another credit. (Arbitrary
 * user-typed emails aren't re-checked in Prospeo mode; that's an Apollo/mock job.)
 */
export async function verifyEmail(email: string | null): Promise<EmailVerifyResult> {
  if (!email) return { status: 'invalid', bounceRisk: 1 };
  return { status: 'valid', bounceRisk: 0.05 };
}
