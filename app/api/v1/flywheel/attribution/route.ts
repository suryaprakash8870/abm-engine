/** GET /api/v1/flywheel/attribution — multi-touch attribution per closed deal. */

import { resolveWorkspaceId } from '@/lib/auth/workspace';
import { getAttribution } from '@/lib/engines/gtm-flywheel/service';
import { ok, handleRouteError } from '@/lib/http/respond';

export async function GET(req: Request) {
  try {
    const workspaceId = resolveWorkspaceId(req);
    return ok(await getAttribution(workspaceId));
  } catch (e) {
    return handleRouteError(e);
  }
}
