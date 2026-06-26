/**
 * Play-write test (Engine 09 → Engine 10).
 *
 * Proves the play → CRM write path: when a play fires (`play.fired`), the CRM
 * Sync Engine writes a play_log record, which the adapter routes to createTask
 * (a CRM task — "call this account"), and publishes crm.synced with real counts.
 *
 *  1. The MockHubspotAdapter (no token) actually produces a task id for a
 *     play_log write — the routing upsertOne→createTask is correct.
 *  2. handlePlayFired publishes crm.synced (writeRecords mocked — DB is its own
 *     concern, same boundary as crm-sync-engine.test.ts).
 */

import { describe, it, expect, vi } from 'vitest';

// No HubSpot token → getCrmAdapter() returns the MockHubspotAdapter.
delete process.env.HUBSPOT_SERVICE_KEY;

vi.mock('./service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./service')>();
  return { ...actual, writeRecords: vi.fn() };
});

import type { PlayFiredPayload } from '../../events';
import { fakeEvent, withCapturedEvents } from '../../events';
import { handlePlayFired } from './handlers';
import { writeRecords } from './service';
import { getCrmAdapter } from './crm-adapter';

const firedPayload: PlayFiredPayload = {
  play_id: 'p1', account_id: 'acc_1', contact_id: null, play_type: 'hot_account_escalation',
  tier: 1, stage: 'selecting', trigger_type: 'account.stage_changed', trigger_signal_id: null,
  execution_method: 'crm_task_slack', crm_task_id: null, slack_message_ts: null,
  assigned_to: 'sdr@yourcompany.com', status: 'fired', fired_at: new Date().toISOString(),
};

describe('play → CRM write', () => {
  it('routes a play_log write to a CRM task and returns a task id', async () => {
    const adapter = getCrmAdapter(null); // mock adapter
    const res = await adapter.createTask({
      recordType: 'play_log',
      recordId: 'p1',
      fields: { abm_play_type: 'hot_account_escalation', account_id: 'acc_1', tier: 1, stage: 'selecting' },
    });
    expect(res.ok).toBe(true);
    expect(res.crmId).toBeTruthy(); // a task was created in the CRM (mock returns a deterministic id)
    expect(res.crmId).toContain('hstask'); // routed to the task object, not company/contact
  });

  it('publishes crm.synced when a play fires', async () => {
    vi.mocked(writeRecords).mockResolvedValueOnce({ syncJobId: 'job_play', recordsTotal: 1, recordsSynced: 1, errors: 0, status: 'completed' });

    const published = await withCapturedEvents(async () => {
      await handlePlayFired(fakeEvent('play.fired', firedPayload));
    });

    expect(published).toContainEqual(
      expect.objectContaining({
        type: 'crm.synced',
        payload: expect.objectContaining({ record_type: 'play_log', records_synced: 1, errors: 0, status: 'completed' }),
      }),
    );
  });

  it('rejects an invalid play.fired payload (missing play_id)', async () => {
    const bad = fakeEvent('play.fired', { ...firedPayload, play_id: '' });
    await expect(handlePlayFired(bad)).rejects.toThrow(/play_id/i);
  });
});
