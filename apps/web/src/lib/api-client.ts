/**
 * Thin fetch wrapper for talking to the NestJS API.
 *
 * Phase 1 dev: attaches `x-org-id` header from NEXT_PUBLIC_DEV_ORG_ID — the
 * tenant middleware on the API uses it to bind the request to an org.
 * Phase 1.5+: replaced by Supabase JWT → API resolves org from session.
 */
const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000';
const DEV_ORG_ID = process.env.NEXT_PUBLIC_DEV_ORG_ID ?? '';

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    ...(DEV_ORG_ID ? { 'x-org-id': DEV_ORG_ID } : {}),
    ...(init?.headers as Record<string, string> | undefined),
  };

  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`${res.status} ${res.statusText} — ${body.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

export function getDevOrgId(): string {
  return DEV_ORG_ID;
}
