/**
 * Google OAuth 2.0 helpers (Authorization Code flow).
 *
 * Configured via GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET. The redirect URI is
 * derived from the request origin so it works across localhost/preview/prod —
 * just register each origin's `/api/v1/auth/google/callback` in the Google
 * console. No new dependency: token + userinfo are plain fetch calls.
 */

import crypto from 'node:crypto';

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const USERINFO_ENDPOINT = 'https://openidconnect.googleapis.com/v1/userinfo';

export function googleConfigured(): boolean {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function redirectUri(origin: string): string {
  return `${origin}/api/v1/auth/google/callback`;
}

/**
 * Public origin of the request. Behind a proxy (Render/Vercel) the raw req.url
 * is the internal address (e.g. https://localhost:10000), which Google rejects.
 * Prefer the proxy's forwarded host/proto headers; fall back to the request URL
 * for local dev (where those headers are absent).
 */
export function publicOrigin(req: Request): string {
  const url = new URL(req.url);
  const h = req.headers;
  const proto = h.get('x-forwarded-proto')?.split(',')[0]?.trim() || url.protocol.replace(':', '');
  const host =
    h.get('x-forwarded-host')?.split(',')[0]?.trim() ||
    h.get('host')?.split(',')[0]?.trim() ||
    url.host;
  return `${proto}://${host}`;
}

/** Build the Google consent URL. `state` ties the callback to this request (CSRF). */
export function googleAuthUrl(origin: string, state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri(origin),
    response_type: 'code',
    scope: 'openid email profile',
    state,
    access_type: 'online',
    prompt: 'select_account',
  });
  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

export function randomState(): string {
  return crypto.randomBytes(16).toString('hex');
}

export interface GoogleProfile {
  email: string;
  name?: string;
  emailVerified: boolean;
}

/** Exchange the authorization code for tokens, then fetch the user's profile. */
export async function exchangeCodeForProfile(code: string, origin: string): Promise<GoogleProfile> {
  const tokenRes = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri(origin),
      grant_type: 'authorization_code',
    }),
  });
  if (!tokenRes.ok) throw new Error(`Google token exchange failed (${tokenRes.status})`);
  const { access_token } = (await tokenRes.json()) as { access_token?: string };
  if (!access_token) throw new Error('Google did not return an access token.');

  const userRes = await fetch(USERINFO_ENDPOINT, { headers: { Authorization: `Bearer ${access_token}` } });
  if (!userRes.ok) throw new Error(`Google userinfo failed (${userRes.status})`);
  const u = (await userRes.json()) as { email?: string; name?: string; email_verified?: boolean };
  if (!u.email) throw new Error('Google profile had no email.');
  return { email: u.email, name: u.name, emailVerified: u.email_verified !== false };
}
