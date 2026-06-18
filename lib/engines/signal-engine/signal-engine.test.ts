/**
 * Signal Engine — integration test (engine 07).
 *
 *  - declared events match the frozen catalog
 *  - real pipeline logic: page-intent scoring, 5-min dedup bucketing, bot filter,
 *    completion gate
 *  - handler attributes contacts without throwing; signal.received contract holds
 *
 * Redis + DB are mocked so the pure logic + handler run without external services.
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('../../clients/redis', () => ({
  getRedisConnection: () => ({ set: async () => 'OK', get: async () => null }),
  pingRedis: async () => true,
}));
vi.mock('../../db/client', () => ({ prisma: {} }));

import engine from './index';
import { assertMatchesCatalog } from '../contract';
import { fakeEvent, withCapturedEvents } from '../../events';
import type { SignalReceivedPayload } from '../../events';
import { handleContactsMapped } from './handlers';
import { publishSignalReceived } from './publisher';
import { classifyPageIntent, computeDedupKey, isBot } from './service';
import { completionCheck } from './validation';

describe('signal-engine', () => {
  it('matches the event catalog', () => {
    expect(() => assertMatchesCatalog(engine)).not.toThrow();
  });

  it('scores high-intent pages above generic ones', () => {
    expect(classifyPageIntent('https://x.com/pricing').signalType).toBe('pricing_page_view');
    expect(classifyPageIntent('https://x.com/').signalType).toBe('generic_pageview');
    expect(classifyPageIntent('https://x.com/pricing').pointsAwarded).toBeGreaterThan(
      classifyPageIntent('https://x.com/blog/hello-world').pointsAwarded,
    );
  });

  it('dedup key buckets same account+type within a 5-minute window', () => {
    const t = 1_700_000_000_000;
    expect(computeDedupKey('acc_1', 'pricing_page_view', t)).toBe(computeDedupKey('acc_1', 'pricing_page_view', t + 60_000));
    expect(computeDedupKey('acc_1', 'pricing_page_view', t)).not.toBe(computeDedupKey('acc_1', 'pricing_page_view', t + 400_000));
    expect(computeDedupKey('acc_1', 'pricing_page_view', t)).not.toBe(computeDedupKey('acc_2', 'pricing_page_view', t));
  });

  it('filters bot traffic, allows real browsers', () => {
    expect(isBot('Googlebot/2.1 (+http://www.google.com/bot.html)')).toBe(true);
    expect(isBot(null)).toBe(true);
    expect(isBot('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36')).toBe(false);
  });

  it('completion check fails when no TAL account matched', () => {
    const { ok, failed } = completionCheck({ matchedToTalAccount: false, deduplicated: true, normalisedAndStored: true, eventPublished: true });
    expect(ok).toBe(false);
    expect(failed[0]).toMatch(/TAL account/);
  });

  it('handler attributes contacts and the signal.received contract holds', async () => {
    const incoming = fakeEvent('contacts.mapped', {
      account_id: 'acct_1', tier: 1, contact_ids: ['c1'], dm_contact_ids: ['c1'],
      champion_contact_ids: [], influencer_contact_ids: [], contacts_found: 1, verified_email_count: 1, stakeholder_map: {},
    });

    const published = await withCapturedEvents(async () => {
      await handleContactsMapped(incoming); // refreshes attribution; must not throw
      const signal: SignalReceivedPayload = {
        account_id: 'acct_1', contact_id: 'c1', signal_type: 'pricing_page_view', signal_source: 'website',
        points_awarded: 25, decay_rate_per_week: 0.5, page_url: 'https://x.com/pricing', metadata: {},
        dedup_key: computeDedupKey('acct_1', 'pricing_page_view', 1_700_000_000_000),
        occurred_at: '2026-06-18T00:00:00.000Z', received_at: '2026-06-18T00:00:00.000Z',
      };
      await publishSignalReceived(signal, { workspaceId: incoming.workspace_id, correlationId: incoming.correlation_id });
    });

    expect(published).toContainEqual(
      expect.objectContaining({ type: 'signal.received', payload: expect.objectContaining({ signal_type: 'pricing_page_view' }) }),
    );
  });
});
