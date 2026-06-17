/** GET /api/v1/contacts — Tier-1/2 accounts with their sourced-contact counts. */

import { resolveWorkspaceId } from '@/lib/auth/workspace';
import { listAccountsWithContacts } from '@/lib/engines/contact-engine/service';
import { ok, handleRouteError } from '@/lib/http/respond';

export async function GET(req: Request) {
  try {
    const workspaceId = resolveWorkspaceId(req);
    return ok(await listAccountsWithContacts(workspaceId));
  } catch (e) {
    return handleRouteError(e);
  }
}
