/**
 * Stateless session token — an HMAC-signed, expiring cookie value.
 *
 * Carries the user's id, workspace id, and email so API routes resolve the tenant
 * from the session (never from a request parameter — conventions.md). Signed with
 * AUTH_SECRET (falls back to ENCRYPTION_KEY, then a dev secret).
 */

import crypto from 'node:crypto';

export { SESSION_COOKIE } from './cookie';

export const SESSION_MAX_AGE = 7 * 24 * 60 * 60; // seconds

export interface Session {
  userId: string;
  workspaceId: string;
  email: string;
}

function secret(): string {
  return process.env.AUTH_SECRET ?? process.env.ENCRYPTION_KEY ?? 'dev-insecure-secret-change-me';
}

export function signSession(s: Session): string {
  const payload = { ...s, exp: Date.now() + SESSION_MAX_AGE * 1000 };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifySession(token: string): Session | null {
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const data = JSON.parse(Buffer.from(body, 'base64url').toString()) as Session & { exp: number };
    if (!data.exp || data.exp < Date.now()) return null;
    return { userId: data.userId, workspaceId: data.workspaceId, email: data.email };
  } catch {
    return null;
  }
}
