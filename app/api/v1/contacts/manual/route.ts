/** POST /api/v1/contacts/manual — manually add a contact to an account. */

import { resolveWorkspaceId } from '@/lib/auth/workspace';
import { addManualContact, getAccountForSourcing, type StakeholderRole } from '@/lib/engines/contact-engine/service';
import { ok, fail, handleRouteError } from '@/lib/http/respond';

export async function POST(req: Request) {
  try {
    const workspaceId = resolveWorkspaceId(req);
    const body = await req.json().catch(() => ({}));
    if (!body?.account_id || !body?.full_name) return fail('VALIDATION_ERROR', 'account_id and full_name are required.');

    // Only TAL accounts (this workspace's Tier-1/2) may have contacts added.
    const account = await getAccountForSourcing(workspaceId, body.account_id);
    if (!account) return fail('NOT_FOUND', 'Account is not on the current TAL.');

    const res = await addManualContact(workspaceId, {
      account_id: account.accountId,
      full_name: body.full_name,
      title: body.title,
      email: body.email,
      role: body.role as StakeholderRole | undefined,
    });
    return ok(res, 201);
  } catch (e) {
    return handleRouteError(e);
  }
}
