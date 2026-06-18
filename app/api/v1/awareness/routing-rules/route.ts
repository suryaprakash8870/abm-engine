/** GET/POST /api/v1/awareness/routing-rules — list + create workspace routing rules. */

import { resolveWorkspaceId } from '@/lib/auth/workspace';
import { listRoutingRules, createRoutingRule } from '@/lib/engines/awareness-engine/service';
import { ok, fail, handleRouteError } from '@/lib/http/respond';

export async function GET(req: Request) {
  try {
    const workspaceId = resolveWorkspaceId(req);
    return ok(await listRoutingRules(workspaceId));
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function POST(req: Request) {
  try {
    const workspaceId = resolveWorkspaceId(req);
    const body = await req.json().catch(() => ({}));
    if (!body?.name?.trim()) return fail('VALIDATION_ERROR', 'name is required.');
    return ok(await createRoutingRule(workspaceId, body), 201);
  } catch (e) {
    return handleRouteError(e);
  }
}
