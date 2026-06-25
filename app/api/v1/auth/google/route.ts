/**
 * GET /api/v1/auth/google — start the Google OAuth flow.
 *
 * Stores a CSRF state + the post-login `next` path in a short-lived signed cookie,
 * then redirects to Google's consent screen. If Google isn't configured, bounces
 * back to /login with an error flag so the UI can explain.
 */

import { NextResponse } from 'next/server';
import { googleConfigured, googleAuthUrl, randomState, publicOrigin } from '@/lib/auth/google';

const STATE_COOKIE = 'g_oauth_state';

export function GET(req: Request) {
  const url = new URL(req.url);
  const origin = publicOrigin(req);
  const next = url.searchParams.get('next') || '/today';

  if (!googleConfigured()) {
    return NextResponse.redirect(`${origin}/login?error=google_unconfigured`);
  }

  const state = randomState();
  const res = NextResponse.redirect(googleAuthUrl(origin, state));
  // Pack the nonce + next into the cookie; the callback verifies the nonce matches.
  res.cookies.set(STATE_COOKIE, `${state}|${next}`, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 600, // 10 minutes
  });
  return res;
}
