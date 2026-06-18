/**
 * Browser-side API client for Engine 09 (Demand Gen Orchestrator).
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

export interface Play {
  id: string;
  account_id: string;
  account_name: string | null;
  domain: string | null;
  play_type: string;
  trigger_type: string;
  execution_method: string;
  status: string;
  tier: number | null;
  assigned_to: string | null;
  outcome: string | null;
  fired_at: string;
}

export const getPlayFeed = (status?: string) =>
  call<Play[]>(`/api/v1/plays/feed${status ? `?status=${status}` : ''}`);

/** The fire route returns the raw PlayFiredPayload (play_id, not the feed's `id`/`account_name`). */
export interface FiredPlay {
  play_id: string;
  account_id: string;
  play_type: string;
  tier: number;
  stage: string;
  execution_method: string;
  status: string;
  slack_message_ts: string | null;
  fired_at: string;
}

export const fireManualPlay = (accountId: string, opts: { stage?: string; trigger_type?: string } = {}) =>
  call<{ status: string; play?: FiredPlay; reason?: string }>('/api/v1/plays/fire', {
    method: 'POST',
    body: JSON.stringify({ account_id: accountId, ...opts }),
  });

export const recordPlayOutcome = (playId: string, outcome: string, notes?: string) =>
  call<{ play_id: string; outcome: string }>(`/api/v1/plays/${playId}/outcome`, {
    method: 'PUT',
    body: JSON.stringify({ outcome, notes }),
  });

export const snoozePlay = (playId: string, days = 7) =>
  call<{ id: string; snoozed_until: string }>(`/api/v1/plays/${playId}/snooze`, {
    method: 'POST',
    body: JSON.stringify({ days }),
  });

export const generateDraft = (playId: string) =>
  call<{ subject_lines: string[]; body: string; model_used: string }>('/api/v1/plays/generate-draft', {
    method: 'POST',
    body: JSON.stringify({ play_id: playId }),
  });
