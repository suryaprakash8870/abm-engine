/**
 * Shared application types (conventions.md). Event payload types live in
 * lib/events/types.ts; Prisma generates DB types (import from @prisma/client).
 * Put only cross-engine, non-event, non-DB shared types here.
 */

import type { EngineSlug } from '../events/catalog';

/** Standard API success envelope: { data, meta? }. */
export interface ApiSuccess<T> {
  data: T;
  meta?: Record<string, unknown>;
}

/** Standard API error envelope: { error: { code, message, details? } }. */
export interface ApiError {
  error: {
    code: ApiErrorCode;
    message: string;
    details?: unknown;
  };
}

export type ApiErrorCode =
  | 'UNAUTHORIZED' // 401
  | 'FORBIDDEN' // 403
  | 'NOT_FOUND' // 404
  | 'VALIDATION_ERROR' // 422
  | 'PLAN_LIMIT' // 402
  | 'CRM_NOT_CONNECTED' // 424
  | 'RATE_LIMITED'; // 429

export const API_ERROR_STATUS: Record<ApiErrorCode, number> = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION_ERROR: 422,
  PLAN_LIMIT: 402,
  CRM_NOT_CONNECTED: 424,
  RATE_LIMITED: 429,
};

/** The authenticated request context every API route resolves from the session. */
export interface RequestContext {
  workspaceId: string;
  userId: string;
  engine?: EngineSlug;
}
