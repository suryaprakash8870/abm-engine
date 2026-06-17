/** GET /api/v1/tal/versions — immutable TAL version history. */

import { resolveWorkspaceId } from '@/lib/auth/workspace';
import { listTalVersions } from '@/lib/engines/tal-manager/service';
import { ok, handleRouteError } from '@/lib/http/respond';

export async function GET(req: Request) {
  try {
    const workspaceId = resolveWorkspaceId(req);
    const versions = await listTalVersions(workspaceId);
    return ok(versions);
  } catch (e) {
    return handleRouteError(e);
  }
}
