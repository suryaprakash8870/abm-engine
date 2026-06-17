/**
 * GET /api/v1/icp — list all ICPs for the authenticated workspace.
 */

import { resolveWorkspaceId } from '@/lib/auth/workspace';
import { listIcps } from '@/lib/engines/icp-engine/service';
import { ok, handleRouteError } from '@/lib/http/respond';

export async function GET(req: Request) {
  try {
    const workspaceId = resolveWorkspaceId(req);
    const icps = await listIcps(workspaceId);
    return ok(icps);
  } catch (e) {
    return handleRouteError(e);
  }
}
