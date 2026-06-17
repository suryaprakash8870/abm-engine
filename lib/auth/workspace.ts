/**
 * Workspace + session resolution for API routes.
 *
 * The tenant comes from the signed session cookie (set at login), NEVER from a
 * request parameter (conventions.md). Multi-tenancy: every engine query is scoped
 * by this workspace id.
 */

import { SESSION_COOKIE, verifySession, type Session } from './session';

export class UnauthorizedError extends Error {
  constructor(message = 'Unauthorized') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

function parseCookies(header: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

/** The verified session for this request, or null. */
export function getSession(req: Request): Session | null {
  const token = parseCookies(req.headers.get('cookie') ?? '')[SESSION_COOKIE];
  return token ? verifySession(token) : null;
}

/** Resolve the caller's workspace id from the session, or throw UnauthorizedError. */
export function resolveWorkspaceId(req: Request): string {
  const session = getSession(req);
  if (!session) throw new UnauthorizedError('Not authenticated.');
  return session.workspaceId;
}
