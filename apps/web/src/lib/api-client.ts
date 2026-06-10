import { getSupabase } from './supabase';

/**
 * Thin fetch wrapper for talking to the NestJS API.
 *
 * Auth (ADR-018): attaches the Supabase session token as a Bearer header when
 * a session exists. Without a session it falls back to the Phase 0
 * `x-org-id` header from NEXT_PUBLIC_DEV_ORG_ID — the API only honors that
 * fallback outside production.
 */
const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000';
const DEV_ORG_ID = process.env.NEXT_PUBLIC_DEV_ORG_ID ?? '';

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    ...(init?.headers as Record<string, string> | undefined),
  };

  if (!headers.authorization) {
    const token = await getAccessToken();
    if (token) {
      headers.authorization = `Bearer ${token}`;
    } else if (DEV_ORG_ID) {
      headers['x-org-id'] = DEV_ORG_ID;
    }
  }

  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`${res.status} ${res.statusText} — ${body.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

async function getAccessToken(): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export function getDevOrgId(): string {
  return DEV_ORG_ID;
}
