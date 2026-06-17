/** GET /api/v1/contacts/account/:accountId — contacts grouped by stakeholder role. */

import { resolveWorkspaceId } from '@/lib/auth/workspace';
import { getContactsForAccount } from '@/lib/engines/contact-engine/service';
import { ok, handleRouteError } from '@/lib/http/respond';

export async function GET(req: Request, { params }: { params: { accountId: string } }) {
  try {
    const workspaceId = resolveWorkspaceId(req);
    return ok(await getContactsForAccount(workspaceId, params.accountId));
  } catch (e) {
    return handleRouteError(e);
  }
}
