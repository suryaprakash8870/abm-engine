/**
 * Browser-side API client for Engine 07 (Signal Engine).
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

export interface TokenInfo {
  token: string;
  snippet_url: string;
  snippet: string;
}

export interface RecentSignal {
  id: string;
  account_id: string;
  account_name: string | null;
  signal_type: string;
  signal_source: string;
  points_awarded: number;
  page_url: string | null;
  occurred_at: string;
}

export interface AccountSignals {
  account_id: string;
  rolling_score: number;
  signals: Array<{
    id: string;
    signal_type: string;
    signal_source: string;
    points_awarded: number;
    current_value: number;
    page_url: string | null;
    contact_id: string | null;
    occurred_at: string;
  }>;
}

export const getTrackingToken = () => call<TokenInfo>('/api/v1/signals/token');
export const getRecentSignals = () => call<RecentSignal[]>('/api/v1/signals');
export const getAccountSignals = (accountId: string) => call<AccountSignals>(`/api/v1/signals/account/${accountId}`);
export const fireTestSignal = () =>
  call<{ status: string; account_id: string; message: string }>('/api/v1/signals/test', { method: 'POST', body: '{}' });
