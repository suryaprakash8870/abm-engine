/**
 * TheirStack client test (Engine 07). Mocks Redis (no cache) + fetch; covers
 * mock mode, live derivation from job postings, and graceful failure.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('./redis', () => ({
  getRedisConnection: () => ({ get: async () => null, set: async () => 'OK' }),
}));

import { fetchCompanySignals, theirstackMode } from './theirstack';

const ENV = { ...process.env };

describe('theirstack client', () => {
  beforeEach(() => { delete process.env.THEIRSTACK_API_KEY; delete process.env.THEIRSTACK_SOURCE; vi.restoreAllMocks(); });
  afterEach(() => { process.env = { ...ENV }; });

  it('returns deterministic mock signals with no key', async () => {
    expect(theirstackMode()).toBe('mock');
    const sigs = await fetchCompanySignals('acme.com');
    expect(sigs.map((s) => s.kind)).toContain('hiring_surge');
  });

  it('derives a hiring surge from live job postings', async () => {
    process.env.THEIRSTACK_API_KEY = 'ts_test';
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ data: [
        { job_title: 'Account Executive', technology_slugs: ['hubspot'] },
        { job_title: 'Senior Backend Engineer', technology_slugs: ['postgres', 'kafka'] },
        { job_title: 'SDR' },
      ] }),
    }) as unknown as Response));

    const sigs = await fetchCompanySignals('https://www.acme.com/');
    const hiring = sigs.find((s) => s.kind === 'hiring_surge');
    expect(hiring).toBeTruthy();
    expect(hiring!.evidence).toMatch(/GTM\/sales/);
    expect(sigs.find((s) => s.kind === 'tech_stack_change')?.evidence).toMatch(/hubspot|postgres/);
  });

  it('returns [] (never throws) on an API error', async () => {
    process.env.THEIRSTACK_API_KEY = 'ts_test';
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 429 }) as Response));
    expect(await fetchCompanySignals('acme.com')).toEqual([]);
  });
});
