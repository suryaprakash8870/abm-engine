/**
 * Integration keys — BYO API keys for data / delivery providers.
 *
 *   GET    → which providers have a key configured (never returns the key)
 *   POST   → { provider, key } — encrypt + upsert
 *   DELETE → { provider } — remove
 *
 * Keys are AES-256-GCM encrypted (same crypto as CRM tokens). Uses raw SQL
 * against integration_keys so it works without regenerating the Prisma client.
 */

import { randomUUID } from 'crypto';
import { resolveWorkspaceId } from '@/lib/auth/workspace';
import { prisma } from '@/lib/db/client';
import { encryptToken } from '@/lib/engines/crm-sync-engine/crypto';
import { ok, fail, handleRouteError } from '@/lib/http/respond';

/** Allowed BYO-key providers (data + delivery). CRM uses OAuth, not this. */
const PROVIDERS = new Set(['apollo', 'clearbit', 'clay', 'ai-ark', 'firecrawl', 'theirstack', 'slack', 'resend', 'telegram']);

export async function GET(req: Request) {
  try {
    const workspaceId = resolveWorkspaceId(req);
    const rows = await prisma.$queryRaw<{ provider: string }[]>`
      SELECT provider FROM integration_keys WHERE workspace_id = ${workspaceId}`;
    return ok({ configured: rows.map((r) => r.provider) });
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function POST(req: Request) {
  try {
    const workspaceId = resolveWorkspaceId(req);
    const body = (await req.json().catch(() => ({}))) as { provider?: unknown; key?: unknown };
    const provider = String(body.provider ?? '').toLowerCase();
    const key = typeof body.key === 'string' ? body.key.trim() : '';
    if (!PROVIDERS.has(provider)) return fail('VALIDATION_ERROR', 'Unknown provider.');
    if (key.length < 8) return fail('VALIDATION_ERROR', 'That API key looks too short.');

    const keyEnc = encryptToken(key);
    await prisma.$executeRaw`
      INSERT INTO integration_keys (id, workspace_id, provider, key_enc, created_at, updated_at)
      VALUES (${randomUUID()}, ${workspaceId}, ${provider}, ${keyEnc}, now(), now())
      ON CONFLICT (workspace_id, provider)
      DO UPDATE SET key_enc = ${keyEnc}, updated_at = now()`;
    return ok({ provider, configured: true });
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function DELETE(req: Request) {
  try {
    const workspaceId = resolveWorkspaceId(req);
    const body = (await req.json().catch(() => ({}))) as { provider?: unknown };
    const provider = String(body.provider ?? '').toLowerCase();
    if (!PROVIDERS.has(provider)) return fail('VALIDATION_ERROR', 'Unknown provider.');
    await prisma.$executeRaw`DELETE FROM integration_keys WHERE workspace_id = ${workspaceId} AND provider = ${provider}`;
    return ok({ provider, configured: false });
  } catch (e) {
    return handleRouteError(e);
  }
}
