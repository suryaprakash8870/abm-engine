/** GET /api/v1/awareness/score/:accountId — current score + 30-day history + recent signals. */

import { resolveWorkspaceId } from '@/lib/auth/workspace';
import { getScoreDetail } from '@/lib/engines/awareness-engine/service';
import { ok, handleRouteError } from '@/lib/http/respond';

export async function GET(req: Request, { params }: { params: { accountId: string } }) {
  try {
    const workspaceId = resolveWorkspaceId(req);
    return ok(await getScoreDetail(workspaceId, params.accountId));
  } catch (e) {
    return handleRouteError(e);
  }
}
