/** GET /api/v1/crm/sync-log — every CRM write operation (user-facing debugging). */

import { resolveWorkspaceId } from '@/lib/auth/workspace';
import { getSyncLog } from '@/lib/engines/crm-sync-engine/service';
import { ok, handleRouteError } from '@/lib/http/respond';

export async function GET(req: Request) {
  try {
    const workspaceId = resolveWorkspaceId(req);
    return ok(await getSyncLog(workspaceId));
  } catch (e) {
    return handleRouteError(e);
  }
}
