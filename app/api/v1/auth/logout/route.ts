/** POST /api/v1/auth/logout — clear the session cookie. */

import { SESSION_COOKIE } from '@/lib/auth/session';
import { ok } from '@/lib/http/respond';

export async function POST() {
  const res = ok({ ok: true });
  res.cookies.set(SESSION_COOKIE, '', { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 0 });
  return res;
}
