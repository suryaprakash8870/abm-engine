/**
 * GET /api/v1/auth/google/callback — finish the Google OAuth flow.
 *
 * Verifies the CSRF state against the cookie, exchanges the code for the user's
 * verified profile, finds-or-creates the account, sets the session cookie, and
 * redirects to the original `next` path. Any failure bounces to /login?error=...
 */

import { NextResponse } from 'next/server';
import { exchangeCodeForProfile, publicOrigin } from '@/lib/auth/google';
import { findOrCreateOAuthUser } from '@/lib/auth/service';
import { signSession, SESSION_COOKIE, SESSION_MAX_AGE } from '@/lib/auth/session';

const STATE_COOKIE = 'g_oauth_state';

function fail(origin: string, code: string): NextResponse {
  const res = NextResponse.redirect(`${origin}/login?error=${code}`);
  res.cookies.delete(STATE_COOKIE);
  return res;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const origin = publicOrigin(req);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');

  // Verify CSRF state + recover the `next` path.
  const cookie = req.headers.get('cookie') ?? '';
  const raw = cookie.split(';').map((c) => c.trim()).find((c) => c.startsWith(`${STATE_COOKIE}=`))?.split('=')[1] ?? '';
  const [savedState, next] = decodeURIComponent(raw).split('|');
  if (!code || !state || !savedState || state !== savedState) return fail(origin, 'google_state');

  try {
    const profile = await exchangeCodeForProfile(code, origin);
    if (!profile.emailVerified) return fail(origin, 'google_unverified');

    const session = await findOrCreateOAuthUser(profile.email, profile.name);
    const res = NextResponse.redirect(`${origin}${next && next.startsWith('/') ? next : '/today'}`);
    res.cookies.set(SESSION_COOKIE, signSession(session), { httpOnly: true, sameSite: 'lax', path: '/', maxAge: SESSION_MAX_AGE });
    res.cookies.delete(STATE_COOKIE);
    return res;
  } catch (e) {
    console.error('[google-oauth] callback failed', e instanceof Error ? e.message : e);
    return fail(origin, 'google_failed');
  }
}
