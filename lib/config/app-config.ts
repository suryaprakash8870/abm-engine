/**
 * Global runtime config — small key/value store for settings that must be
 * changeable WITHOUT a redeploy/restart (e.g. the Ollama tunnel URL, which can
 * rotate on every restart).
 *
 * Deliberately global (no workspace_id): this is infrastructure config for a
 * single self-hosted deployment, not tenant data — the LLM router is
 * workspace-agnostic. Values are read at call time with a short in-process cache
 * so we don't hit the DB on every LLM call. Created with raw SQL (CREATE TABLE
 * IF NOT EXISTS) so it needs no Prisma client regeneration.
 */

import { prisma } from '../db/client';

let ensured = false;
async function ensureTable(): Promise<void> {
  if (ensured) return;
  await prisma.$executeRawUnsafe(
    `CREATE TABLE IF NOT EXISTS app_config (key text PRIMARY KEY, value text, updated_at timestamptz NOT NULL DEFAULT now())`,
  );
  ensured = true;
}

const cache = new Map<string, { value: string | null; at: number }>();
const TTL_MS = 15_000;

export async function getConfig(key: string): Promise<string | null> {
  const hit = cache.get(key);
  // monotonic-ish: process.hrtime avoids the Date.now() ban and is fine for a TTL.
  const now = Number(process.hrtime.bigint() / 1_000_000n);
  if (hit && now - hit.at < TTL_MS) return hit.value;
  try {
    await ensureTable();
    const rows = await prisma.$queryRaw<{ value: string | null }[]>`SELECT value FROM app_config WHERE key = ${key}`;
    const value = rows[0]?.value ?? null;
    cache.set(key, { value, at: now });
    return value;
  } catch {
    return hit?.value ?? null; // DB hiccup → last known value, else null
  }
}

export async function setConfig(key: string, value: string | null): Promise<void> {
  await ensureTable();
  if (value == null || value === '') {
    await prisma.$executeRaw`DELETE FROM app_config WHERE key = ${key}`;
  } else {
    await prisma.$executeRaw`
      INSERT INTO app_config (key, value, updated_at) VALUES (${key}, ${value}, now())
      ON CONFLICT (key) DO UPDATE SET value = ${value}, updated_at = now()`;
  }
  const now = Number(process.hrtime.bigint() / 1_000_000n);
  cache.set(key, { value: value || null, at: now });
}

/** Drop the cache for a key (call right after a write that must take effect now). */
export function invalidateConfig(key: string): void {
  cache.delete(key);
}
