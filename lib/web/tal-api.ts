/**
 * Browser-side API client for Engine 05 (TAL Manager).
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

export interface TalAccountRow {
  account_id: string;
  name: string | null;
  domain: string | null;
  tier: number;
  score: number;
}

export interface CurrentTal {
  id: string;
  name: string;
  version: number;
  account_count: number;
  status: string;
  review_status: 'reviewed' | 'unreviewed';
  updated_at: string;
  accounts: TalAccountRow[];
}

export interface TalVersionRow {
  version_number: number;
  account_count: number;
  tier1_count: number;
  tier2_count: number;
  tier3_count: number;
  suppressed_count: number;
  created_at: string;
}

export const getTal = () => call<CurrentTal | null>('/api/v1/tal');

export const getTalVersions = () => call<TalVersionRow[]>('/api/v1/tal/versions');

export const finalizeTal = () =>
  call<{ tal_id: string; version: number; account_count: number; tier1_count: number; tier2_count: number; tier3_count: number; suppressed_count: number; review_status: string }>(
    '/api/v1/tal/finalize',
    { method: 'POST' },
  );

export const suppressAccount = (input: { domain?: string; account_id?: string; reason: string }) =>
  call<{ id: string }>('/api/v1/tal/suppress', { method: 'POST', body: JSON.stringify(input) });
