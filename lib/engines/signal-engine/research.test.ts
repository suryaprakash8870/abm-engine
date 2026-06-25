/**
 * Signal Engine — 3rd-party research intake test (engine 07).
 *
 * Runs researchAccount fully in mock mode (Firecrawl mock markdown + mock LLM
 * extractor) with Redis/DB mocked, so it exercises scrape → extract → ingest
 * without any paid key, credits, or external services.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Force mock providers BEFORE importing the modules under test.
process.env.FIRECRAWL_SOURCE = 'mock';
process.env.LLM_PROVIDER = 'mock';
delete process.env.FIRECRAWL_API_KEY;

vi.mock('../../clients/redis', () => ({
  getRedisConnection: () => ({
    set: async (_k: string, _v: string, ..._rest: unknown[]) => 'OK', // fresh dedup + cache writes
    get: async () => null,
  }),
  pingRedis: async () => true,
}));

// Minimal prisma: signal.create echoes a row shaped like the real model.
vi.mock('../../db/client', () => ({
  prisma: {
    signal: {
      create: async ({ data }: { data: Record<string, unknown> }) => ({
        ...data,
        occurredAt: new Date(data.occurredAt as string),
        receivedAt: new Date(),
      }),
    },
  },
}));

import { researchAccount } from './research';
import { THIRD_PARTY_SIGNALS } from './service';

describe('signal-engine research', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns no findings when the account has no domain', async () => {
    const res = await researchAccount('ws_1', { accountId: 'a1', name: 'Acme', domain: null });
    expect(res.scraped).toBe(false);
    expect(res.findings).toHaveLength(0);
  });

  it('scrapes (mock), extracts signals, and ingests them', async () => {
    const res = await researchAccount('ws_1', { accountId: 'a1', name: 'Acme', domain: 'acme.com' });

    expect(res.scraped).toBe(true);
    expect(res.source).toBe('mock');
    expect(res.findings.length).toBeGreaterThan(0);
    // The mock markdown mentions funding + hiring, so those kinds must be found.
    const kinds = res.findings.map((f) => f.kind);
    expect(kinds).toContain('funding_round');
    expect(kinds).toContain('hiring_surge');
    // Every finding kind is a known third-party signal.
    for (const k of kinds) expect(Object.keys(THIRD_PARTY_SIGNALS)).toContain(k);
    // High-confidence findings ingest as published signals.
    expect(res.ingested.some((r) => r.status === 'published')).toBe(true);
  });
});
