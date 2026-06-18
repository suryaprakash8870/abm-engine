import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE } from './lib/auth/cookie';

/**
 * Gate the app pages behind a session. This only checks the cookie is PRESENT
 * (edge-safe — no signature verify here); API routes verify the signature.
 */
export function middleware(req: NextRequest) {
  if (!req.cookies.get(SESSION_COOKIE)) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', req.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/icp/:path*', '/accounts/:path*', '/tam/:path*', '/scoring/:path*', '/tal/:path*', '/contacts/:path*', '/signals/:path*', '/awareness/:path*', '/plays/:path*'],
};
