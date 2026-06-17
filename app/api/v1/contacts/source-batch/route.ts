/** POST /api/v1/contacts/source-batch — source contacts for every Tier-1/2 account. */

import { resolveWorkspaceId } from '@/lib/auth/workspace';
import { loadAccountsToProcess } from '@/lib/engines/contact-engine/service';
import { enqueueSourcingJob } from '@/lib/engines/contact-engine/contact-queue';
import { ok, fail, handleRouteError } from '@/lib/http/respond';

export async function POST(req: Request) {
  try {
    const workspaceId = resolveWorkspaceId(req);
    const accounts = await loadAccountsToProcess(workspaceId);
    if (accounts.length === 0) return fail('NOT_FOUND', 'No Tier-1/2 accounts on the TAL. Finalize a TAL first.');

    for (const a of accounts) {
      await enqueueSourcingJob({ workspaceId, accountId: a.accountId, tier: a.tier, domain: a.domain, name: a.name });
    }
    return ok({ queued: accounts.length, message: `Sourcing enqueued for ${accounts.length} accounts.` });
  } catch (e) {
    return handleRouteError(e);
  }
}
