/**
 * Browser-side API client for Engine 10 (CRM Sync Engine).
 */

import type { ApiResult } from './icp-api';

async function call<T>(path: string, init?: RequestInit, timeoutMs?: number): Promise<ApiResult<T>> {
  const ctrl = timeoutMs ? new AbortController() : undefined;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : undefined;
  try {
    const res = await fetch(path, { ...init, signal: ctrl?.signal, headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) } });
    const body = await res.json().catch(() => ({}));
    if (res.ok) return { ok: true, status: res.status, data: body.data as T };
    return { ok: false, status: res.status, error: body.error ?? { code: 'UNKNOWN', message: res.statusText } };
  } catch (e) {
    const aborted = e instanceof DOMException && e.name === 'AbortError';
    return {
      ok: false,
      status: 0,
      error: aborted
        ? { code: 'TIMEOUT', message: 'Request timed out — the sync is taking too long. Try again.' }
        : { code: 'NETWORK', message: e instanceof Error ? e.message : 'network error' },
    };
  } finally {
    if (timer) clearTimeout(timer);
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

// ── BYO API keys (data / delivery providers) ─────────────────────────────────
export const getIntegrationKeys = () => call<{ configured: string[] }>('/api/v1/integrations/keys');
export const saveIntegrationKey = (provider: string, key: string) =>
  call<{ provider: string; configured: boolean }>('/api/v1/integrations/keys', { method: 'POST', body: JSON.stringify({ provider, key }) });
export const removeIntegrationKey = (provider: string) =>
  call<{ provider: string; configured: boolean }>('/api/v1/integrations/keys', { method: 'DELETE', body: JSON.stringify({ provider }) });
export const sendTelegramTest = () =>
  call<{ sent: boolean }>('/api/v1/integrations/telegram/test', { method: 'POST', body: '{}' });

export interface CrmImportSummary {
  mode: string; companies: number; contacts: number; deals: number;
  closed_won: number; closed_lost: number; events_emitted: number;
}
export const importFromCrm = () =>
  call<CrmImportSummary>('/api/v1/crm/import', { method: 'POST', body: '{}' });

export interface CrmSyncSummary {
  mode: string; accounts: number; contacts: number; synced: number; errors: number;
}
export const syncToCrm = () =>
  call<CrmSyncSummary>('/api/v1/crm/sync', { method: 'POST', body: '{}' }, 60_000);
