/**
 * People Data Labs client — company enrichment (Engine 03), a free-tier data
 * source that complements Prospeo. `company/enrich` returns real firmographics
 * (industry, employee count, location, founded) plus keyword/tech `tags`.
 *
 * ENABLE: set PDL_API_KEY. When present, enrichment prefers PDL (its own free
 * 100-credit pool) so it doesn't drain Prospeo. Falls back to Prospeo/mock on a
 * miss (404), an error, or once PDL_CREDIT_BUDGET (default 60) is reached.
 *
 * Returns the SAME shape as the Prospeo company data so callers are interchangeable.
 *
 * @see https://docs.peopledatalabs.com/docs/company-enrichment-api
 */

const BASE = 'https://api.peopledatalabs.com/v5';

export interface CompanyFirmographics {
  name: string | null;
  industry: string | null;
  headcount: number | null;
  revenue: string | null;
  geography: string | null;
  fundingStage: string;
  techStack: string[];
}

export function shouldUsePdl(): boolean {
  return !!process.env.PDL_API_KEY && process.env.ENRICH_SOURCE !== 'mock';
}

// Per-process credit guard so a big pipeline run can't drain the 100/month pool.
let creditsUsed = 0;
function budget(): number {
  const n = Number(process.env.PDL_CREDIT_BUDGET);
  return Number.isFinite(n) && n > 0 ? n : 60;
}
export function pdlCreditsUsed(): number { return creditsUsed; }

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
// Keep only tech-ish tags for the "tech stack" (PDL tags mix tech + go-to-market keywords).
const TECH_HINT = /cloud|aws|azure|gcp|kubernetes|docker|react|node|python|java|golang|ruby|salesforce|hubspot|snowflake|datadog|postgres|api|saas|devops|analytics|security|software|platform|\bdata\b|machine learning|\bai\b|kafka|elastic|mongo/i;

function extractTech(j: Record<string, unknown>): string[] {
  const techs = Array.isArray(j.technologies)
    ? (j.technologies as unknown[]).map((t) => (typeof t === 'string' ? t : str((t as Record<string, unknown>).name)))
    : [];
  const tags = Array.isArray(j.tags) ? (j.tags as unknown[]).filter((t): t is string => typeof t === 'string') : [];
  return [...techs, ...tags.filter((t) => TECH_HINT.test(t))]
    .filter((t): t is string => !!t)
    .filter((t, i, a) => a.indexOf(t) === i)
    .slice(0, 15);
}

/** Real firmographics for one company by domain (1 credit on a match; 0 on a 404). */
export async function pdlEnrichCompany(domain: string): Promise<CompanyFirmographics | null> {
  if (!process.env.PDL_API_KEY || creditsUsed >= budget()) return null;
  try {
    const res = await fetch(`${BASE}/company/enrich?website=${encodeURIComponent(domain)}`, {
      headers: { 'X-Api-Key': process.env.PDL_API_KEY },
    });
    if (res.status === 404) return null; // not in PDL's database (no charge)
    const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (res.status !== 200) return null;
    creditsUsed += 1;
    const loc = (j.location ?? null) as Record<string, unknown> | null;
    return {
      name: str(j.name) ?? str(j.display_name),
      industry: str(j.industry),
      headcount: typeof j.employee_count === 'number' ? (j.employee_count as number) : null,
      revenue: null,
      geography: str(loc?.country) ?? str(loc?.name) ?? str(j.location as unknown),
      fundingStage: (str(j.type) ?? '').toLowerCase().includes('public') ? 'public' : 'private',
      techStack: extractTech(j),
    };
  } catch {
    return null;
  }
}
