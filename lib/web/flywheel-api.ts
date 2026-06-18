/**
 * Browser-side API client for Engine 11 (GTM Flywheel).
 */

import type { ApiResult } from './icp-api';

async function call<T>(path: string): Promise<ApiResult<T>> {
  try {
    const res = await fetch(path, { headers: { 'Content-Type': 'application/json' } });
    const body = await res.json().catch(() => ({}));
    if (res.ok) return { ok: true, status: res.status, data: body.data as T };
    return { ok: false, status: res.status, error: body.error ?? { code: 'UNKNOWN', message: res.statusText } };
  } catch (e) {
    return { ok: false, status: 0, error: { code: 'NETWORK', message: e instanceof Error ? e.message : 'network error' } };
  }
}

type TierMap = Record<string, number>;

export interface PipelineData {
  latest: { date: string; pipeline_by_tier: TierMap; win_rate_by_tier: TierMap; avg_deal_size_by_tier: TierMap; days_to_close_by_tier: TierMap } | null;
  history: Array<{ date: string; pipeline_by_tier: TierMap }>;
}

export interface CorrelationData {
  has_enough_data: boolean;
  sample_size: number;
  needed?: number;
  combinations: Array<{ signal_combination: string[]; correlation_score: number }>;
}

export interface MetricsData {
  closed_won: number;
  closed_lost: number;
  metrics: Array<{ metric_key: string; value: number; period: string }>;
}

export interface AttributionDeal {
  deal_id: string;
  account_id: string;
  touches: Array<{ touch_type: string; subtype: string | null; weight: number; occurred_at: string }>;
}

export const getPipeline = () => call<PipelineData>('/api/v1/flywheel/pipeline');
export const getAttribution = () => call<AttributionDeal[]>('/api/v1/flywheel/attribution');
export const getCorrelation = () => call<CorrelationData>('/api/v1/flywheel/correlation');
export const getFlywheelMetrics = () => call<MetricsData>('/api/v1/flywheel/metrics');
