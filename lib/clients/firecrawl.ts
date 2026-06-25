/**
 * Firecrawl client — web research for 3rd-party signals (Engines 03 · 07).
 *
 * Scrapes a company's site / news pages to markdown so the LLM can extract
 * buying signals (funding, hiring, product launches, tech-stack changes).
 *
 * FREE TESTING: leave FIRECRAWL_API_KEY unset (or FIRECRAWL_SOURCE=mock) and
 * scrape() returns deterministic synthetic markdown — no key, no credits burned.
 * Set FIRECRAWL_API_KEY for the real API. Server-only: the key is a secret and
 * must never reach the browser.
 *
 * Results are cached in Redis (default 24h) so we never re-scrape the same URL
 * within its TTL — Firecrawl free credits are limited.
 */

import { getRedisConnection } from './redis';

export interface ScrapeResult {
  url: string;
  title: string | null;
  description: string | null;
  markdown: string;
  /** Outbound links (useful for finding news / careers pages). */
  links: string[];
  /** True when this came from the mock generator, not the real API. */
  mock: boolean;
}

const CACHE_TTL_SECONDS = 60 * 60 * 24; // 24h
const CACHE_PREFIX = 'firecrawl:scrape:';

function shouldUseMock(): boolean {
  return process.env.FIRECRAWL_SOURCE === 'mock' || !process.env.FIRECRAWL_API_KEY;
}

function normalizeUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, '');
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

// ── Mock generator ───────────────────────────────────────────────────────────

function mockScrape(url: string): ScrapeResult {
  const host = url.replace(/^https?:\/\//, '').split('/')[0];
  const name = host.split('.')[0];
  const cap = name.charAt(0).toUpperCase() + name.slice(1);
  return {
    url,
    title: `${cap} — Company`,
    description: `${cap} builds software for modern teams.`,
    markdown: [
      `# ${cap}`,
      '',
      `${cap} is a fast-growing company. Recently announced a new product line and`,
      'is actively hiring across sales and engineering. Backed by recent funding.',
      '',
      '## Careers',
      'We are hiring SDRs, Account Executives, and Platform Engineers.',
    ].join('\n'),
    links: [`${url}/pricing`, `${url}/careers`, `${url}/blog`],
    mock: true,
  };
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Scrape a URL to markdown. Cached in Redis by normalized URL for CACHE_TTL.
 * Never throws on a scrape failure — returns null so callers can degrade.
 */
export async function scrape(rawUrl: string): Promise<ScrapeResult | null> {
  const url = normalizeUrl(rawUrl);
  const cacheKey = CACHE_PREFIX + url;

  try {
    const cached = await getRedisConnection().get(cacheKey);
    if (cached) return JSON.parse(cached) as ScrapeResult;
  } catch {
    /* cache miss / redis down — proceed to fetch */
  }

  let result: ScrapeResult;

  if (shouldUseMock()) {
    result = mockScrape(url);
  } else {
    try {
      const { Firecrawl } = await import('firecrawl');
      const app = new Firecrawl({ apiKey: process.env.FIRECRAWL_API_KEY! });
      const doc = await app.scrape(url, { formats: ['markdown', 'links'] });
      result = {
        url,
        title: doc.metadata?.title ?? null,
        description: doc.metadata?.description ?? null,
        markdown: doc.markdown ?? '',
        links: doc.links ?? [],
        mock: false,
      };
    } catch (e) {
      console.error('[firecrawl] scrape failed', url, e instanceof Error ? e.message : e);
      return null;
    }
  }

  try {
    await getRedisConnection().set(cacheKey, JSON.stringify(result), 'EX', CACHE_TTL_SECONDS);
  } catch {
    /* non-fatal — caching is best-effort */
  }

  return result;
}

/** Which mode the client is in — surfaced in health checks / settings. */
export function firecrawlMode(): 'live' | 'mock' {
  return shouldUseMock() ? 'mock' : 'live';
}
