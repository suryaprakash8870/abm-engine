/** POST /api/v1/contacts/source — source contacts for a single account (async). */

import { resolveWorkspaceId } from '@/lib/auth/workspace';
import { getAccountForSourcing } from '@/lib/engines/contact-engine/service';
import { enqueueSourcingJob } from '@/lib/engines/contact-engine/contact-queue';
import { ok, fail, handleRouteError } from '@/lib/http/respond';

export async function POST(req: Request) {
  try {
    const workspaceId = resolveWorkspaceId(req);
    const body = await req.json().catch(() => ({}));
    const accountId = body?.account_id;
    if (typeof accountId !== 'string' || !accountId) return fail('VALIDATION_ERROR', 'account_id is required.');

    const account = await getAccountForSourcing(workspaceId, accountId);
    if (!account) return fail('NOT_FOUND', 'Account is not on the current TAL.');

    await enqueueSourcingJob({ workspaceId, accountId: account.accountId, tier: account.tier, domain: account.domain, name: account.name });
    return ok({ queued: 1, account_id: account.accountId, message: 'Sourcing job enqueued.' });
  } catch (e) {
    return handleRouteError(e);
  }
}
