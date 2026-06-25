/**
 * CRM import test (Engine 10, HubSpot as INPUT). Forces the mock adapter (no
 * token) so importFromCrm reads sample companies/deals, and asserts closed-won/
 * lost deals republish as crm.deal_closed_* events (the ICP/Flywheel feedback loop).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// No HubSpot token → getCrmAdapter() returns MockHubspotAdapter (sample data).
delete process.env.HUBSPOT_SERVICE_KEY;

vi.mock('../../db/client', () => ({
  prisma: {
    // resolveAccessToken → no connection → null (forces mock adapter)
    crmConnection: { findUnique: async () => null },
    // resolveAccountByDomain → match the seeded domains to an account id
    talAccount: { findFirst: async () => ({ accountId: 'acc_1' }) },
  },
}));

import { importFromCrm } from './service';
import { withCapturedEvents } from '../../events';

describe('crm import', () => {
  beforeEach(() => vi.clearAllMocks());

  it('imports sample data and republishes closed-won/lost as deal events', async () => {
    let summary!: Awaited<ReturnType<typeof importFromCrm>>;
    const published = await withCapturedEvents(async () => {
      summary = await importFromCrm('ws_1', 'corr_1');
    });

    expect(summary.mode).toBe('hubspot_mock');
    expect(summary.companies).toBeGreaterThan(0);
    expect(summary.closed_won).toBe(1);
    expect(summary.closed_lost).toBe(1);
    expect(summary.events_emitted).toBe(2);

    const types = published.map((e) => e.type);
    expect(types).toContain('crm.deal_closed_won');
    expect(types).toContain('crm.deal_closed_lost');
  });
});
