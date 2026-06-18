/** GET /api/v1/flywheel/metrics — all flywheel metrics + win/loss totals. */

import { resolveWorkspaceId } from '@/lib/auth/workspace';
import { getMetrics } from '@/lib/engines/gtm-flywheel/service';
import { ok, handleRouteError } from '@/lib/http/respond';

export async function GET(req: Request) {
  try {
    const workspaceId = resolveWorkspaceId(req);
    return ok(await getMetrics(workspaceId));
  } catch (e) {
    return handleRouteError(e);
  }
}
