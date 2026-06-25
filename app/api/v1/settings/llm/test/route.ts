/**
 * POST /api/v1/settings/llm/test — ping the Ollama endpoint (GET /api/tags) to
 * confirm the (possibly just-pasted) tunnel URL is reachable before relying on it.
 * Tests the saved config, or an ad-hoc { url, auth } passed in the body.
 */

import { resolveWorkspaceId } from '@/lib/auth/workspace';
import { resolveOllamaConfig } from '@/lib/clients/llm';
import { ok, fail, handleRouteError } from '@/lib/http/respond';

export async function POST(req: Request) {
  try {
    resolveWorkspaceId(req);
    const body = (await req.json().catch(() => ({}))) as { url?: string; auth?: string };
    const saved = await resolveOllamaConfig();
    const url = (body.url?.trim() || saved.url).replace(/\/+$/, '');
    const authHeader = body.auth?.trim() || saved.authHeader || undefined;

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    try {
      const res = await fetch(`${url}/api/tags`, {
        headers: authHeader ? { Authorization: authHeader } : undefined,
        signal: ctrl.signal,
      });
      if (!res.ok) return fail('VALIDATION_ERROR', `Endpoint responded ${res.status}.`);
      const data = (await res.json().catch(() => ({}))) as { models?: { name: string }[] };
      const models = (data.models ?? []).map((m) => m.name);
      return ok({ reachable: true, url, models });
    } finally {
      clearTimeout(timer);
    }
  } catch (e) {
    if (e instanceof Error && (e.name === 'AbortError' || e.message.includes('fetch'))) {
      return fail('VALIDATION_ERROR', 'Could not reach the endpoint (timeout or DNS/connection error).');
    }
    return handleRouteError(e);
  }
}
