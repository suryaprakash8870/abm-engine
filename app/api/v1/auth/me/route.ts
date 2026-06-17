/** GET /api/v1/auth/me — the current session user, or 401. */

import { getSession } from '@/lib/auth/workspace';
import { ok, fail, handleRouteError } from '@/lib/http/respond';

export async function GET(req: Request) {
  try {
    const session = getSession(req);
    if (!session) return fail('UNAUTHORIZED', 'Not authenticated.');
    return ok({ email: session.email, workspace_id: session.workspaceId });
  } catch (e) {
    return handleRouteError(e);
  }
}
