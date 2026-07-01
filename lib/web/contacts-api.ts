/**
 * Browser-side API client for Engine 06 (Contact Engine).
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

export type StakeholderRole = 'decision_maker' | 'champion' | 'influencer';

export interface AccountWithContacts {
  account_id: string;
  name: string | null;
  domain: string | null;
  tier: number;
  contact_count: number;
}

export interface ContactCard {
  id: string;
  full_name: string;
  title: string | null;
  email: string | null;
  email_status: string | null;
  linkedin_url: string | null;
  role: string | null;
  role_confidence: number | null;
  flagged_for_review: boolean;
}

export interface AccountContacts {
  account_id: string;
  decision_makers: ContactCard[];
  champions: ContactCard[];
  influencers: ContactCard[];
  total: number;
}

export const listContacts = () => call<AccountWithContacts[]>('/api/v1/contacts');

export const getAccountContacts = (accountId: string) =>
  call<AccountContacts>(`/api/v1/contacts/account/${accountId}`);

export const sourceContacts = (accountId: string) =>
  call<{ queued: number; account_id: string }>('/api/v1/contacts/source', {
    method: 'POST',
    body: JSON.stringify({ account_id: accountId }),
  });

export const sourceBatch = (limit = 5) =>
  call<{ queued: number; message: string }>('/api/v1/contacts/source-batch', { method: 'POST', body: JSON.stringify({ limit }) });

export const updateContactRole = (contactId: string, role: StakeholderRole) =>
  call<{ id: string; role: string }>(`/api/v1/contacts/${contactId}/role`, {
    method: 'PUT',
    body: JSON.stringify({ role }),
  });

export const addManualContact = (input: { account_id: string; full_name: string; title?: string; email?: string; role?: StakeholderRole }) =>
  call<{ id: string }>('/api/v1/contacts/manual', { method: 'POST', body: JSON.stringify(input) });
