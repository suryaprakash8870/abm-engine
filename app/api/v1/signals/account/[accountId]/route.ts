/** GET /api/v1/signals/account/:accountId — all signals + rolling score for an account. */

import { resolveWorkspaceId } from '@/lib/auth/workspace';
import { getSignalsForAccount } from '@/lib/engines/signal-engine/service';
import { ok, handleRouteError } from '@/lib/http/respond';

export async function GET(req: Request, { params }: { params: { accountId: string } }) {
  try {
    const workspaceId = resolveWorkspaceId(req);
    return ok(await getSignalsForAccount(workspaceId, params.accountId));
  } catch (e) {
    return handleRouteError(e);
  }
}
