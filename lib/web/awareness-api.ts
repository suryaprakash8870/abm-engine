/**
 * Browser-side API client for Engine 08 (Awareness Engine).
 */

import type { ApiResult } from './icp-api';

async function call<T>(path: string, init?: RequestInit): Promise<ApiResult<T>> {
  try {
    const res = await fetch(path, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) } });
    const body = await res.json().catch(() => ({}));
    if (res.ok) return { ok: true, status: res.status, data: body.data as T };
    return { ok: false, status: res.status, error: body.error ?? { code: 'UNKNOWN', message: res.statusText } };
  } catch (e) {
    return { ok: false, status: 0, error: { code: 'NETWORK', message: e instanceof Error ? e.message : 'network error' } };
  }
}

export interface FeedAccount {
  account_id: string;
  name: string | null;
  domain: string | null;
  tier: number | null;
  score: number;
  stage: string;
  score_7d_change: number;
  last_signal_at: string | null;
  top_signals: Array<{ signal_type: string; occurred_at: string }>;
}

export interface RoutingRule {
  id: string;
  name: string;
  isActive: boolean;
  triggerConfig: { min_score?: number; stage?: string; signal_types?: string[] };
  actions: string[];
  priority: number;
  cooldownDays: number;
  maxPerMonth: number;
}

export const getAwarenessFeed = (filters: { min_score?: number; stage?: string } = {}) => {
  const q = new URLSearchParams();
  if (filters.min_score) q.set('min_score', String(filters.min_score));
  if (filters.stage) q.set('stage', filters.stage);
  const qs = q.toString();
  return call<FeedAccount[]>(`/api/v1/awareness/feed${qs ? `?${qs}` : ''}`);
};

export const getAwarenessScore = (accountId: string) =>
  call<{ account_id: string; current_score: number; stage: string; score_7d_change: number; score_30d_change: number; dominant_signal_type: string; history: Array<{ date: string; score: number }>; recent_signals: Array<{ signal_type: string; points_awarded: number; current_value: number; occurred_at: string }> }>(`/api/v1/awareness/score/${accountId}`);

export const listRoutingRules = () => call<RoutingRule[]>('/api/v1/awareness/routing-rules');

export const createRoutingRule = (input: { name: string; trigger_config?: Record<string, unknown>; actions?: string[]; cooldown_days?: number; max_per_month?: number }) =>
  call<RoutingRule>('/api/v1/awareness/routing-rules', { method: 'POST', body: JSON.stringify(input) });

export const updateRoutingRule = (id: string, patch: { is_active?: boolean; name?: string; priority?: number }) =>
  call<RoutingRule>(`/api/v1/awareness/routing-rules/${id}`, { method: 'PUT', body: JSON.stringify(patch) });
