/** GET /api/v1/flywheel/correlation — signal correlation (suppressed below 20 deals). */

import { resolveWorkspaceId } from '@/lib/auth/workspace';
import { getCorrelation } from '@/lib/engines/gtm-flywheel/service';
import { ok, handleRouteError } from '@/lib/http/respond';

export async function GET(req: Request) {
  try {
    const workspaceId = resolveWorkspaceId(req);
    return ok(await getCorrelation(workspaceId));
  } catch (e) {
    return handleRouteError(e);
  }
}
