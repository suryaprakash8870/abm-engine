/**
 * Integration test for the Demand Gen Orchestrator (Engine 09).
 *
 *  - declared events match the frozen catalog
 *  - real play matrix (tier × stage → play)
 *  - completion gate
 *  - handler publishes play.fired ONLY when a play fires; nothing on suppressed /
 *    not-on-TAL (resolveTier + runOrchestration mocked; DB-backed firing is its own concern)
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('./service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./service')>();
  return { ...actual, resolveTier: vi.fn(), runOrchestration: vi.fn() };
});

import { fakeEvent, withCapturedEvents } from '../../events';
import { assertMatchesCatalog } from '../contract';
import { engine } from './index';
import { handleAccountStageChanged } from './handlers';
import { defaultPlay, resolveTier, runOrchestration } from './service';
import { completionCheck } from './validation';
import type { PlayFiredPayload } from '../../events';

const stageEvent = () =>
  fakeEvent('account.stage_changed', { account_id: 'acc_1', from_stage: 'interested', to_stage: 'considering', score: 72, changed_at: new Date().toISOString() });

const firedPayload: PlayFiredPayload = {
  play_id: 'p1', account_id: 'acc_1', contact_id: null, play_type: 'executive_engagement', tier: 1, stage: 'considering',
  trigger_type: 'account.stage_changed', trigger_signal_id: null, execution_method: 'crm_task_slack', crm_task_id: null,
  slack_message_ts: '123.000100', assigned_to: 'unassigned', status: 'fired', fired_at: new Date().toISOString(),
};

describe('demand-gen-orchestrator engine', () => {
  it('matches the event catalog', () => {
    expect(() => assertMatchesCatalog(engine)).not.toThrow();
  });

  it('play matrix: tier × stage (and hot) → the right play', () => {
    expect(defaultPlay(1, 'considering', 'account.stage_changed').playType).toBe('executive_engagement');
    expect(defaultPlay(1, 'aware', 'account.stage_changed').playType).toBe('sdr_outreach');
    expect(defaultPlay(2, 'considering', 'account.stage_changed')).toEqual({ playType: 'nurture_sequence', executionMethod: 'sequence' });
    expect(defaultPlay(3, 'aware', 'account.stage_changed').executionMethod).toBe('sequence');
    expect(defaultPlay(1, 'aware', 'account.hot').playType).toBe('hot_account_alert');
    expect(defaultPlay(2, 'aware', 'account.hot').playType).toBe('hot_account_fast_track');
  });

  it('completion check fails when no play was selected', () => {
    const { ok, failed } = completionCheck({ playSelected: false, suppressionCheckedBeforeExternalCall: true, crmTaskOrSlackSent: true, playFiredPublishedAndLogged: true });
    expect(ok).toBe(false);
    expect(failed[0]).toMatch(/play selected/i);
  });

  it('publishes play.fired when a play fires', async () => {
    vi.mocked(resolveTier).mockResolvedValueOnce(1);
    vi.mocked(runOrchestration).mockResolvedValueOnce({ status: 'fired', payload: firedPayload });
    const published = await withCapturedEvents(async () => { await handleAccountStageChanged(stageEvent()); });
    expect(published).toContainEqual(expect.objectContaining({ type: 'play.fired' }));
  });

  it('publishes nothing when the account is suppressed', async () => {
    vi.mocked(resolveTier).mockResolvedValueOnce(1);
    vi.mocked(runOrchestration).mockResolvedValueOnce({ status: 'suppressed', reason: 'cooldown' });
    const published = await withCapturedEvents(async () => { await handleAccountStageChanged(stageEvent()); });
    expect(published.find((p) => p.type === 'play.fired')).toBeUndefined();
  });

  it('publishes nothing when the account is not on the TAL', async () => {
    vi.mocked(resolveTier).mockResolvedValueOnce(null);
    const published = await withCapturedEvents(async () => { await handleAccountStageChanged(stageEvent()); });
    expect(published.find((p) => p.type === 'play.fired')).toBeUndefined();
  });
});
