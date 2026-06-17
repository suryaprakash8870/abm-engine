/** GET /api/v1/tal — the current Target Account List + its active accounts. */

import { resolveWorkspaceId } from '@/lib/auth/workspace';
import { getCurrentTal } from '@/lib/engines/tal-manager/service';
import { ok, handleRouteError } from '@/lib/http/respond';

export async function GET(req: Request) {
  try {
    const workspaceId = resolveWorkspaceId(req);
    const tal = await getCurrentTal(workspaceId);
    return ok(tal);
  } catch (e) {
    return handleRouteError(e);
  }
}
