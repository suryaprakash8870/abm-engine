/**
 * Integration test for the Contact Engine (#06).
 *
 * Guarantees (conventions.md):
 *   1. Declared consumes/publishes match the frozen catalog.
 *   2. tal.finalized fans out one async sourcing job per Tier-1/2 account.
 *   3. The published contacts.mapped matches the contract.
 *   4. The completion check gates a Tier-1 account with no verified contact.
 *
 * The DB-backed service + Redis-backed queue are mocked so the handler's fan-out
 * and the gate are exercised without Postgres/Redis.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./service', () => ({
  loadAccountsToProcess: vi.fn(async () => [
    { accountId: 'acc_1', tier: 1, domain: 'a.com', name: 'A' },
    { accountId: 'acc_2', tier: 2, domain: 'b.com', name: 'B' },
  ]),
}));

vi.mock('./contact-queue', () => ({
  enqueueSourcingJob: vi.fn(async () => {}),
  startContactWorker: () => ({}),
}));

import { engine } from './index';
import { handleTalFinalized } from './handlers';
import { enqueueSourcingJob } from './contact-queue';
import { completionCheck } from './validation';
import { publishContactsMapped } from './publisher';
import { assertMatchesCatalog } from '../contract';
import { fakeEvent, withCapturedEvents } from '../../events';
import type { ContactsMappedPayload, TalFinalizedPayload } from '../../events';

const sampleTalFinalized: TalFinalizedPayload = {
  tal_id: 'tal_123',
  version: 1,
  version_number: 1,
  account_count: 3,
  tier1_count: 1,
  tier2_count: 1,
  tier3_count: 1,
  status: 'finalized',
  review_status: 'reviewed',
  suppressed_count: 0,
  finalized_at: '2026-06-16T12:00:00.000Z',
};

describe('contact-engine', () => {
  beforeEach(() => vi.mocked(enqueueSourcingJob).mockClear());

  it('matches the frozen event catalog', () => {
    expect(() => assertMatchesCatalog(engine)).not.toThrow();
  });

  it('enqueues one sourcing job per Tier-1/2 account on tal.finalized', async () => {
    await handleTalFinalized(fakeEvent('tal.finalized', sampleTalFinalized));
    expect(enqueueSourcingJob).toHaveBeenCalledTimes(2);
    expect(enqueueSourcingJob).toHaveBeenCalledWith(expect.objectContaining({ accountId: 'acc_1', tier: 1 }));
    expect(enqueueSourcingJob).toHaveBeenCalledWith(expect.objectContaining({ accountId: 'acc_2', tier: 2 }));
  });

  it('publishes contacts.mapped with the stakeholder map (contract)', async () => {
    const published = await withCapturedEvents(async () => {
      const payload: ContactsMappedPayload = {
        account_id: 'acc_1',
        tier: 1,
        contact_ids: ['c1', 'c2'],
        dm_contact_ids: ['c1'],
        champion_contact_ids: ['c2'],
        influencer_contact_ids: [],
        contacts_found: 2,
        verified_email_count: 2,
        stakeholder_map: { dm: ['c1'], champion: ['c2'], influencer: [] },
      };
      await publishContactsMapped(payload, { workspaceId: 'ws_1', correlationId: 'corr_1' });
    });
    expect(published).toContainEqual(
      expect.objectContaining({ type: 'contacts.mapped', payload: expect.objectContaining({ account_id: 'acc_1', verified_email_count: 2 }) }),
    );
  });

  it('completion check fails a Tier-1 account with no verified, role-assigned contact', () => {
    const { ok, failed } = completionCheck({
      isTier1: true,
      hasVerifiedRoleAssignedContact: false,
      allContactsHaveVerifiedEmailStatus: true,
      crmPushConfirmed: true,
      contactsMappedEventPublished: true,
    });
    expect(ok).toBe(false);
    expect(failed[0]).toMatch(/Tier 1/);
  });
});
