/**
 * Standard API response helpers (conventions.md):
 *   success → { data, meta? }   error → { error: { code, message, details? } }
 */

import { NextResponse } from 'next/server';
import { UnauthorizedError } from '../auth/workspace';
import { API_ERROR_STATUS, type ApiErrorCode } from '../types';

export function ok<T>(data: T, status = 200): NextResponse {
  return NextResponse.json({ data }, { status });
}

export function fail(code: ApiErrorCode, message: string, details?: unknown): NextResponse {
  return NextResponse.json({ error: { code, message, details } }, { status: API_ERROR_STATUS[code] });
}

/** Map a thrown error to a standard response (UnauthorizedError → 401, else 500). */
export function handleRouteError(e: unknown): NextResponse {
  if (e instanceof UnauthorizedError) return fail('UNAUTHORIZED', e.message);
  const message = e instanceof Error ? e.message : 'internal error';
  return NextResponse.json({ error: { code: 'INTERNAL', message } }, { status: 500 });
}
