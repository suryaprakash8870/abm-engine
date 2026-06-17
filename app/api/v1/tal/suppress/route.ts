/** POST /api/v1/tal/suppress — add an account/domain to the suppression list. */

import { resolveWorkspaceId } from '@/lib/auth/workspace';
import { addSuppression } from '@/lib/engines/tal-manager/service';
import { ok, fail, handleRouteError } from '@/lib/http/respond';

export async function POST(req: Request) {
  try {
    const workspaceId = resolveWorkspaceId(req);
    const body = await req.json().catch(() => ({}));
    if (!body || typeof body !== 'object') return fail('VALIDATION_ERROR', 'Request body must be JSON.');
    const res = await addSuppression(workspaceId, {
      domain: body.domain,
      accountId: body.account_id,
      reason: body.reason,
      suppressedUntil: body.suppressed_until ?? null,
    });
    return ok(res, 201);
  } catch (e) {
    return handleRouteError(e);
  }
}
