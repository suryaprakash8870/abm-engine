/**
 * Integration test for the CRM Sync Engine (engine 10).
 *
 *  - declared events match the frozen catalog
 *  - real logic: batchByType chunking, inbound deal parsing, AES token roundtrip
 *  - completion gate
 *  - handler publishes crm.synced with real counts (writeRecords mocked; the
 *    DB/adapter write is its own concern)
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('./service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./service')>();
  return { ...actual, writeRecords: vi.fn(), recordsForTalFinalized: vi.fn() };
});

import { fakeEvent, withCapturedEvents } from '../../events';
import { assertMatchesCatalog } from '../contract';
import { engine } from './index';
import { handleTalFinalized } from './handlers';
import { batchByType, parseInboundDealWebhook, writeRecords, recordsForTalFinalized, type CrmWriteRecord } from './service';
import { completionCheck } from './validation';
import { encryptToken, decryptToken } from './crypto';

const talEvent = () =>
  fakeEvent('tal.finalized', {
    tal_id: 'tal_123', version: 1, version_number: 1, account_count: 1, tier1_count: 1, tier2_count: 0, tier3_count: 0,
    status: 'finalized', review_status: 'reviewed', suppressed_count: 0, finalized_at: '2026-06-16T12:00:00.000Z',
  });

describe('crm-sync-engine', () => {
  it('matches the event catalog', () => {
    expect(() => assertMatchesCatalog(engine)).not.toThrow();
  });

  it('batches by type and chunks at 100', () => {
    const recs: CrmWriteRecord[] = Array.from({ length: 150 }, (_, i) => ({ recordType: 'account', recordId: `a${i}`, fields: {} }));
    const batches = batchByType(recs);
    expect(batches.length).toBe(2);
    expect(batches[0].length).toBe(100);
    expect(batches[1].length).toBe(50);
    // distinct types never share a batch
    const mixed: CrmWriteRecord[] = [{ recordType: 'account', recordId: 'a', fields: {} }, { recordType: 'contact', recordId: 'c', fields: {} }];
    expect(batchByType(mixed).length).toBe(2);
  });

  it('parses inbound deal webhooks into won/lost/open', () => {
    expect(parseInboundDealWebhook('hubspot', { stage: 'closedwon', amount: 5000, domain: 'x.com' }).resolution).toBe('won');
    expect(parseInboundDealWebhook('hubspot', { stage: 'Closed Lost' }).resolution).toBe('lost');
    expect(parseInboundDealWebhook('hubspot', { stage: 'qualified' }).resolution).toBe('open');
    expect(parseInboundDealWebhook('hubspot', { stage: 'closedwon', amount: '5000' }).amount).toBe(5000); // string coerced
  });

  it('encrypts + decrypts tokens (never plaintext at rest)', () => {
    const enc = encryptToken('super-secret-oauth-token');
    expect(enc).not.toContain('super-secret-oauth-token');
    expect(decryptToken(enc)).toBe('super-secret-oauth-token');
  });

  it('completion check fails when a batch was not fully confirmed', () => {
    const { ok, failed } = completionCheck({ allBatchWritesConfirmed: false, failedRecordsDeadLettered: true, inboundWebhooksParsedAndPublished: true, crmSyncedEventPublished: true });
    expect(ok).toBe(false);
    expect(failed[0]).toMatch(/confirmed by the CRM/i);
  });

  it('publishes crm.synced with real counts when it consumes tal.finalized', async () => {
    vi.mocked(recordsForTalFinalized).mockResolvedValueOnce([{ recordType: 'account', recordId: 'a1', fields: {} }]);
    vi.mocked(writeRecords).mockResolvedValueOnce({ syncJobId: 'job_1', recordsTotal: 1, recordsSynced: 1, errors: 0, status: 'completed' });

    const published = await withCapturedEvents(async () => { await handleTalFinalized(talEvent()); });
    expect(published).toContainEqual(
      expect.objectContaining({ type: 'crm.synced', payload: expect.objectContaining({ records_synced: 1, errors: 0, status: 'completed' }) }),
    );
  });
});
