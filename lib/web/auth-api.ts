/** Browser-side auth calls. The session cookie is sent automatically (same-origin). */

export interface AuthResult<T> {
  ok: boolean;
  status: number;
  data?: T;
  error?: { code: string; message: string };
}

async function call<T>(path: string, init?: RequestInit): Promise<AuthResult<T>> {
  try {
    const res = await fetch(path, { ...init, headers: { 'Content-Type': 'application/json' } });
    const body = await res.json().catch(() => ({}));
    if (res.ok) return { ok: true, status: res.status, data: body.data as T };
    return { ok: false, status: res.status, error: body.error ?? { code: 'UNKNOWN', message: res.statusText } };
  } catch (e) {
    return { ok: false, status: 0, error: { code: 'NETWORK', message: e instanceof Error ? e.message : 'network error' } };
  }
}

export const signup = (email: string, password: string, fullName?: string) =>
  call<{ email: string }>('/api/v1/auth/signup', { method: 'POST', body: JSON.stringify({ email, password, full_name: fullName }) });

export const login = (email: string, password: string) =>
  call<{ email: string }>('/api/v1/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });

export const logout = () => call<{ ok: boolean }>('/api/v1/auth/logout', { method: 'POST' });

export const me = () => call<{ email: string; workspace_id: string }>('/api/v1/auth/me');
