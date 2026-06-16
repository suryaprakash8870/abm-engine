/**
 * Prisma client singleton.
 *
 * RLS NOTE: tenant isolation is enforced at the database level by Supabase
 * Row Level Security (ADR-004). Application queries additionally scope by
 * workspace_id for defence in depth. Each engine queries ONLY its own tables
 * (conventions.md) — never another engine's.
 */

import { PrismaClient } from '@prisma/client';

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

export const prisma: PrismaClient =
  global.__prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  global.__prisma = prisma;
}
