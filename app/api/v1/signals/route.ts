/** GET /api/v1/signals — recent signals across the workspace (the live feed). */

import { resolveWorkspaceId } from '@/lib/auth/workspace';
import { getRecentSignals } from '@/lib/engines/signal-engine/service';
import { ok, handleRouteError } from '@/lib/http/respond';

export async function GET(req: Request) {
  try {
    const workspaceId = resolveWorkspaceId(req);
    return ok(await getRecentSignals(workspaceId));
  } catch (e) {
    return handleRouteError(e);
  }
}
