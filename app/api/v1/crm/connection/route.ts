/** GET /api/v1/crm/connection — CRM connection status per workspace. */

import { resolveWorkspaceId } from '@/lib/auth/workspace';
import { getConnectionStatus } from '@/lib/engines/crm-sync-engine/service';
import { ok, handleRouteError } from '@/lib/http/respond';

export async function GET(req: Request) {
  try {
    const workspaceId = resolveWorkspaceId(req);
    return ok(await getConnectionStatus(workspaceId));
  } catch (e) {
    return handleRouteError(e);
  }
}
