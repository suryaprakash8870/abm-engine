/** POST /api/v1/auth/login — verify credentials, set the session cookie. */

import { z } from 'zod';
import { loginUser, AuthError } from '@/lib/auth/service';
import { signSession, SESSION_COOKIE, SESSION_MAX_AGE } from '@/lib/auth/session';
import { ok, fail, handleRouteError } from '@/lib/http/respond';

const schema = z.object({ email: z.string().email(), password: z.string().min(1) });

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const parsed = schema.safeParse(body);
    if (!parsed.success) return fail('VALIDATION_ERROR', 'Email and password are required.');

    let session;
    try {
      session = await loginUser(parsed.data.email, parsed.data.password);
    } catch (e) {
      if (e instanceof AuthError) return fail('UNAUTHORIZED', e.message);
      throw e;
    }

    const res = ok({ email: session.email });
    res.cookies.set(SESSION_COOKIE, signSession(session), { httpOnly: true, sameSite: 'lax', path: '/', maxAge: SESSION_MAX_AGE });
    return res;
  } catch (e) {
    return handleRouteError(e);
  }
}
