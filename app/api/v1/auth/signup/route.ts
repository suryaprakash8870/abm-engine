/** POST /api/v1/auth/signup — create account + workspace, set the session cookie. */

import { z } from 'zod';
import { signupUser, AuthError } from '@/lib/auth/service';
import { signSession, SESSION_COOKIE, SESSION_MAX_AGE } from '@/lib/auth/session';
import { ok, fail, handleRouteError } from '@/lib/http/respond';

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters.'),
  full_name: z.string().optional(),
});

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const parsed = schema.safeParse(body);
    if (!parsed.success) return fail('VALIDATION_ERROR', 'A valid email and an 8+ character password are required.', parsed.error.flatten());

    let session;
    try {
      session = await signupUser(parsed.data.email, parsed.data.password, parsed.data.full_name);
    } catch (e) {
      if (e instanceof AuthError) return fail('VALIDATION_ERROR', e.message);
      throw e;
    }

    const res = ok({ email: session.email });
    res.cookies.set(SESSION_COOKIE, signSession(session), { httpOnly: true, sameSite: 'lax', path: '/', maxAge: SESSION_MAX_AGE });
    return res;
  } catch (e) {
    return handleRouteError(e);
  }
}
