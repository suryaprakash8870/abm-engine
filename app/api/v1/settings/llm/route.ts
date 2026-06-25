/**
 * GET  /api/v1/settings/llm — current Ollama runtime config (url, model, source).
 * PUT  /api/v1/settings/llm — update url / model / auth (takes effect immediately,
 *      no restart). The auth header is stored encrypted; empty clears it.
 *
 * Global config (single self-hosted deployment). Session-gated.
 */

import { resolveWorkspaceId } from '@/lib/auth/workspace';
import { getConfig, setConfig } from '@/lib/config/app-config';
import { resolveOllamaConfig } from '@/lib/clients/llm';
import { encryptToken } from '@/lib/engines/crm-sync-engine/crypto';
import { ok, fail, handleRouteError } from '@/lib/http/respond';

export async function GET(req: Request) {
  try {
    resolveWorkspaceId(req); // gate
    const cfg = await resolveOllamaConfig();
    const hasAuth = !!(await getConfig('ollama_auth'));
    return ok({ url: cfg.url, model: cfg.model, source: cfg.source, has_auth: hasAuth });
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function PUT(req: Request) {
  try {
    resolveWorkspaceId(req);
    const body = (await req.json().catch(() => ({}))) as { url?: unknown; model?: unknown; auth?: unknown };

    if (body.url !== undefined) {
      const url = String(body.url ?? '').trim();
      if (url && !/^https?:\/\//i.test(url)) return fail('VALIDATION_ERROR', 'URL must start with http:// or https://');
      await setConfig('ollama_url', url || null);
    }
    if (body.model !== undefined) {
      await setConfig('ollama_model', String(body.model ?? '').trim() || null);
    }
    if (body.auth !== undefined) {
      const auth = String(body.auth ?? '').trim();
      await setConfig('ollama_auth', auth ? encryptToken(auth) : null);
    }

    const cfg = await resolveOllamaConfig();
    return ok({ url: cfg.url, model: cfg.model, source: cfg.source, has_auth: !!(await getConfig('ollama_auth')) });
  } catch (e) {
    return handleRouteError(e);
  }
}
