/**
 * TheirStack client — job-posting + technographic signals (Engine 07).
 *
 * Given a company domain, pulls recent job postings and derives third-party
 * buying signals: a hiring surge (especially GTM/sales/eng roles) and tech-stack
 * adoption (technologies named in postings).
 *
 * FREE TESTING: leave THEIRSTACK_API_KEY unset (or THEIRSTACK_SOURCE=mock) and
 * it returns deterministic synthetic signals — no key, no credits. The real API
 * has a free tier (200 API credits/mo). Server-only secret. Cached in Redis 24h
 * so the same domain isn't queried twice within its TTL.
 */

import { getRedisConnection } from './redis';

export interface CompanySignal {
  kind: 'hiring_surge' | 'tech_stack_change';
  confidence: number;
  evidence: string;
}

const CACHE_TTL_SECONDS = 60 * 60 * 24;
const CACHE_PREFIX = 'theirstack:signals:';
const GTM_ROLE = /sales|account executive|\bae\b|\bsdr\b|bdr|revenue|go.?to.?market|growth|demand gen|marketing/i;

function shouldUseMock(): boolean {
  return process.env.THEIRSTACK_SOURCE === 'mock' || !process.env.THEIRSTACK_API_KEY;
}

function cleanDomain(raw: string): string {
  return raw.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
}

export function theirstackMode(): 'live' | 'mock' {
  return shouldUseMock() ? 'mock' : 'live';
}

function mockSignals(domain: string): CompanySignal[] {
  return [
    { kind: 'hiring_surge', confidence: 0.7, evidence: `Multiple open sales & engineering roles at ${domain} in the last 30 days.` },
    { kind: 'tech_stack_change', confidence: 0.5, evidence: `Recent postings mention adopting new platform tooling at ${domain}.` },
  ];
}

interface TheirStackJob {
  job_title?: string;
  technology_slugs?: string[];
  technologies?: string[];
}

function deriveSignals(domain: string, jobs: TheirStackJob[]): CompanySignal[] {
  const out: CompanySignal[] = [];
  if (jobs.length === 0) return out;

  const gtm = jobs.filter((j) => GTM_ROLE.test(j.job_title ?? '')).length;
  // Hiring surge: scaled by total recent postings, stronger when GTM roles are present.
  const base = Math.min(0.9, 0.4 + jobs.length * 0.05 + gtm * 0.08);
  out.push({
    kind: 'hiring_surge',
    confidence: Number(base.toFixed(2)),
    evidence: `${jobs.length} recent job posting${jobs.length === 1 ? '' : 's'}${gtm ? ` incl. ${gtm} GTM/sales role${gtm === 1 ? '' : 's'}` : ''} at ${domain}.`,
  });

  const techs = [...new Set(jobs.flatMap((j) => j.technology_slugs ?? j.technologies ?? []))].slice(0, 8);
  if (techs.length) {
    out.push({ kind: 'tech_stack_change', confidence: 0.55, evidence: `Stack signals in postings: ${techs.join(', ')}.` });
  }
  return out;
}

/** Fetch derived company signals for a domain. Never throws — returns [] on failure. */
export async function fetchCompanySignals(rawDomain: string): Promise<CompanySignal[]> {
  const domain = cleanDomain(rawDomain);
  if (!domain) return [];
  const cacheKey = CACHE_PREFIX + domain;

  try {
    const cached = await getRedisConnection().get(cacheKey);
    if (cached) return JSON.parse(cached) as CompanySignal[];
  } catch { /* proceed */ }

  let signals: CompanySignal[];
  if (shouldUseMock()) {
    signals = mockSignals(domain);
  } else {
    try {
      const res = await fetch('https://api.theirstack.com/v1/jobs/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.THEIRSTACK_API_KEY!}` },
        body: JSON.stringify({ page: 0, limit: 25, company_domain_or: [domain], posted_at_max_age_days: 30 }),
      });
      if (!res.ok) {
        console.error('[theirstack] search failed', res.status);
        return [];
      }
      const data = (await res.json()) as { data?: TheirStackJob[] };
      signals = deriveSignals(domain, data.data ?? []);
    } catch (e) {
      console.error('[theirstack] error', e instanceof Error ? e.message : e);
      return [];
    }
  }

  try {
    await getRedisConnection().set(cacheKey, JSON.stringify(signals), 'EX', CACHE_TTL_SECONDS);
  } catch { /* best-effort */ }
  return signals;
}
