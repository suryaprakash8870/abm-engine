/**
 * Engine 11 — GTM Flywheel · integration test.
 *
 *  - declared events match the frozen catalog
 *  - real cadence: every-5th-win + completion gate
 *  - invalid payload → flywheel.error (verify-before-publish)
 *  - valid win → flywheel.metrics_updated, and icp.refresh_recommended on the 5th
 *    (DB-backed service steps mocked; their aggregation is its own concern)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./service')>();
  return {
    ...actual,
    buildAttribution: vi.fn(), recordWinLoss: vi.fn(), calculateTierMetrics: vi.fn(),
    runSignalCorrelation: vi.fn(), closedWonCount: vi.fn(), claimIcpRefreshMilestone: vi.fn(),
    buildIcpRefreshRecommendation: vi.fn(), updateAntiIcp: vi.fn(), buildMetricsUpdatedPayload: vi.fn(),
  };
});

import { fakeEvent, withCapturedEvents } from '../../events';
import { assertMatchesCatalog } from '../contract';
import engine from './index';
import { handleCrmDealClosedWon } from './handlers';
import { completionCheck } from './validation';
import {
  shouldRecommendIcpRefresh, buildAttribution, recordWinLoss, calculateTierMetrics,
  runSignalCorrelation, closedWonCount, claimIcpRefreshMilestone, buildIcpRefreshRecommendation, buildMetricsUpdatedPayload,
} from './service';

const validWon = (dealId = 'deal_x') =>
  fakeEvent('crm.deal_closed_won', { deal_id: dealId, crm_type: 'hubspot', account_id: 'acc_1', domain: 'x.com', amount: 50000, stage: 'closedwon', closed_at: '2026-06-18T10:00:00.000Z', owner_id: null });

const metrics = { pipeline_by_tier: {}, win_rate_by_tier: {}, avg_deal_size_by_tier: {}, days_to_close_by_tier: {}, snapshot_date: '2026-06-18' };
const metricsPayload = { ...metrics, metric_keys_changed: ['pipeline_by_tier'] };

function primeWon(count: number, dealId = 'deal_x') {
  vi.mocked(buildAttribution).mockResolvedValueOnce({ deal_id: dealId, account_id: 'acc_1', first_touch: null, last_touch: null, linear: [], touch_count: 3, days_to_close: 10 });
  vi.mocked(recordWinLoss).mockResolvedValueOnce(undefined);
  vi.mocked(calculateTierMetrics).mockResolvedValueOnce(metrics);
  vi.mocked(runSignalCorrelation).mockResolvedValueOnce({ hasEnoughData: false, sample_size: count, combinations: [] });
  vi.mocked(closedWonCount).mockResolvedValueOnce(count);
  vi.mocked(buildMetricsUpdatedPayload).mockResolvedValueOnce(metricsPayload);
}

beforeEach(() => vi.mocked(claimIcpRefreshMilestone).mockResolvedValue(false));

describe('gtm-flywheel engine', () => {
  it('declares events that match the frozen catalog', () => {
    expect(() => assertMatchesCatalog(engine)).not.toThrow();
  });

  it('recommends an ICP refresh on every 5th win only', () => {
    expect(shouldRecommendIcpRefresh(0)).toBe(false);
    expect(shouldRecommendIcpRefresh(4)).toBe(false);
    expect(shouldRecommendIcpRefresh(5)).toBe(true);
    expect(shouldRecommendIcpRefresh(10)).toBe(true);
  });

  it('completion check fails when attribution was not built', () => {
    const { ok, failed } = completionCheck({ attributionBuiltForEveryClosedDeal: false, pipelineWinRateByTierCalculated: true, correlationSuppressedBelow20Points: true, metricsUpdatedPublished: true, icpRefreshFiredEvery5thWin: true });
    expect(ok).toBe(false);
    expect(failed[0]).toMatch(/Attribution/);
  });

  it('publishes flywheel.error when a consumed payload is invalid', async () => {
    const published = await withCapturedEvents(async () => {
      await handleCrmDealClosedWon(fakeEvent('crm.deal_closed_won', { deal_id: '', crm_type: 'hubspot', account_id: null, domain: '', amount: null, stage: 'closed_won', closed_at: '', owner_id: null }));
    });
    expect(published).toContainEqual(expect.objectContaining({ type: 'flywheel.error' }));
  });

  it('publishes flywheel.metrics_updated on a win (no ICP refresh when not the 5th)', async () => {
    primeWon(3);
    const published = await withCapturedEvents(async () => { await handleCrmDealClosedWon(validWon()); });
    const types = published.map((p) => p.type);
    expect(types).toContain('flywheel.metrics_updated');
    expect(types).not.toContain('icp.refresh_recommended');
  });

  it('fires icp.refresh_recommended on the 5th win — closing the loop to Engine 01', async () => {
    primeWon(5);
    vi.mocked(claimIcpRefreshMilestone).mockResolvedValueOnce(true); // milestone claimed atomically
    vi.mocked(buildIcpRefreshRecommendation).mockResolvedValueOnce({ closed_won_count: 5, trigger_deal_id: 'deal_x', new_closed_won_deal_ids: ['deal_x'], account_attributes: {}, recommended_changes_summary: 'refresh' });
    const published = await withCapturedEvents(async () => { await handleCrmDealClosedWon(validWon()); });
    const types = published.map((p) => p.type);
    expect(types).toContain('icp.refresh_recommended');
    expect(types).toContain('flywheel.metrics_updated');
  });
});
