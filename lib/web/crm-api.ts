/**
 * Browser-side API client for Engine 10 (CRM Sync Engine).
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

export interface CrmConnection {
  crm_type: string;
  status: string;
  portal_id: string | null;
  connected_at: string;
  expires_at: string;
}

export interface SyncLogRow {
  id: string;
  record_type: string;
  record_id: string;
  operation: string;
  outcome: string;
  synced_at: string;
  detail?: unknown;
}

export const getCrmConnections = () => call<CrmConnection[]>('/api/v1/crm/connection');
export const connectHubspot = () => call<{ connected: boolean; portal_id: string }>('/api/v1/oauth/hubspot', { method: 'POST' });
export const disconnectHubspot = () => call<{ connected: boolean }>('/api/v1/oauth/hubspot', { method: 'DELETE' });
export const getSyncLog = () => call<SyncLogRow[]>('/api/v1/crm/sync-log');
