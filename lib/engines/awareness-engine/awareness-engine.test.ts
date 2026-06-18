/**
 * Integration test for the Awareness Engine (engine 08).
 *
 *  - declared events match the frozen catalog
 *  - real logic: 5-stage mapping + decay factor (NaN/range-safe)
 *  - completion gate
 *  - handler publishes account.score_updated ALWAYS, and stage_changed / hot
 *    only conditionally (processSignal mocked; the DB-backed recompute is its own concern)
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('./awareness-queue', () => ({ startDailyDecayJob: () => {} }));
vi.mock('./service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./service')>();
  return { ...actual, processSignal: vi.fn() };
});

import { fakeEvent, withCapturedEvents } from '../../events';
import { assertMatchesCatalog } from '../contract';
import { engine } from './index';
import { handleSignalReceived } from './handlers';
import { stageForScore, decayFactor, processSignal } from './service';
import { completionCheck } from './validation';

const baseSignal = {
  account_id: 'acc_1', contact_id: null, signal_type: 'pricing_page_view', signal_source: 'website',
  points_awarded: 25, decay_rate_per_week: 0.5, page_url: null, metadata: {},
  dedup_key: 'k', occurred_at: '2026-06-18T00:00:00.000Z', received_at: '2026-06-18T00:00:00.000Z',
};

describe('awareness-engine', () => {
  it('matches the event catalog', () => {
    expect(() => assertMatchesCatalog(engine)).not.toThrow();
  });

  it('maps scores to the 5-stage ladder', () => {
    expect(stageForScore(0)).toBe('identified');
    expect(stageForScore(25)).toBe('aware');
    expect(stageForScore(45)).toBe('interested');
    expect(stageForScore(65)).toBe('considering');
    expect(stageForScore(85)).toBe('selecting');
  });

  it('decay factor: fresh=1, halves after a week at 0.5/wk, NaN/range-safe', () => {
    expect(decayFactor(0.5, 0)).toBe(1);
    expect(decayFactor(0.5, 1)).toBeCloseTo(0.5, 5);
    expect(Number.isFinite(decayFactor(NaN, 2))).toBe(true);
    expect(Number.isFinite(decayFactor(1.5, 2))).toBe(true); // clamped — no negative^fractional
  });

  it('completion check fails when score is not capped', () => {
    const { ok, failed } = completionCheck({
      scoreUpdatedCappedAndDecayed: false, stageAssignedFromScore: true,
      stageChangedPublishedIfBoundaryCrossed: true, routingRulesEvaluatedAndForwarded: true,
    });
    expect(ok).toBe(false);
    expect(failed[0]).toMatch(/capped at 100/);
  });

  it('publishes score_updated always, plus stage_changed + hot conditionally', async () => {
    vi.mocked(processSignal).mockResolvedValueOnce({
      scoreUpdated: { account_id: 'acc_1', current_score: 65, previous_score: 30, stage: 'considering', score_7d_change: 35, score_30d_change: 65, last_signal_at: baseSignal.occurred_at, last_calculated_at: baseSignal.occurred_at },
      stageChanged: { account_id: 'acc_1', from_stage: 'aware', to_stage: 'considering', score: 65, changed_at: baseSignal.occurred_at },
      hot: { account_id: 'acc_1', current_score: 65, score_change: 35, window_hours: 48, stage: 'considering', dominant_signal_type: 'pricing_page_view', top_recent_signals: [] },
      matchedRuleCount: 1,
    });
    const published = await withCapturedEvents(async () => { await handleSignalReceived(fakeEvent('signal.received', baseSignal)); });
    const types = published.map((p) => p.type);
    expect(types).toContain('account.score_updated');
    expect(types).toContain('account.stage_changed');
    expect(types).toContain('account.hot');
  });

  it('publishes only score_updated when no stage change and not hot', async () => {
    vi.mocked(processSignal).mockResolvedValueOnce({
      scoreUpdated: { account_id: 'acc_1', current_score: 25, previous_score: 20, stage: 'aware', score_7d_change: 5, score_30d_change: 25, last_signal_at: baseSignal.occurred_at, last_calculated_at: baseSignal.occurred_at },
      stageChanged: null, hot: null, matchedRuleCount: 0,
    });
    const published = await withCapturedEvents(async () => { await handleSignalReceived(fakeEvent('signal.received', baseSignal)); });
    const types = published.map((p) => p.type);
    expect(types).toContain('account.score_updated');
    expect(types).not.toContain('account.stage_changed');
    expect(types).not.toContain('account.hot');
  });
});
