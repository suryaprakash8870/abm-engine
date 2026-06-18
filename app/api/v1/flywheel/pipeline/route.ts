/** GET /api/v1/flywheel/pipeline — pipeline / win-rate / deal-size / days-to-close by tier. */

import { resolveWorkspaceId } from '@/lib/auth/workspace';
import { getPipeline } from '@/lib/engines/gtm-flywheel/service';
import { ok, handleRouteError } from '@/lib/http/respond';

export async function GET(req: Request) {
  try {
    const workspaceId = resolveWorkspaceId(req);
    return ok(await getPipeline(workspaceId));
  } catch (e) {
    return handleRouteError(e);
  }
}
