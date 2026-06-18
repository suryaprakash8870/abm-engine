/** PUT /api/v1/awareness/routing-rules/:id — update a routing rule (toggle, thresholds, actions). */

import { resolveWorkspaceId } from '@/lib/auth/workspace';
import { updateRoutingRule } from '@/lib/engines/awareness-engine/service';
import { ok, handleRouteError } from '@/lib/http/respond';

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  try {
    const workspaceId = resolveWorkspaceId(req);
    const body = await req.json().catch(() => ({}));
    return ok(await updateRoutingRule(workspaceId, params.id, body));
  } catch (e) {
    return handleRouteError(e);
  }
}
