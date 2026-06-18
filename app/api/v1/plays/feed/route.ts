/** GET /api/v1/plays/feed — the active play queue (filter: status). */

import { resolveWorkspaceId } from '@/lib/auth/workspace';
import { getPlayFeed } from '@/lib/engines/demand-gen-orchestrator/service';
import { ok, handleRouteError } from '@/lib/http/respond';

export async function GET(req: Request) {
  try {
    const workspaceId = resolveWorkspaceId(req);
    const status = new URL(req.url).searchParams.get('status');
    return ok(await getPlayFeed(workspaceId, { status: status ?? undefined }));
  } catch (e) {
    return handleRouteError(e);
  }
}
