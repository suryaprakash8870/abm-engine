/**
 * POST /api/v1/contacts/source-batch — source contacts for the top-N Tier-1/2
 * accounts (highest-scored first). `limit` (default 5) caps how many are sourced
 * so a single click can't drain paid data-provider credits on every account.
 */

import { resolveWorkspaceId } from '@/lib/auth/workspace';
import { loadAccountsToProcess } from '@/lib/engines/contact-engine/service';
import { enqueueSourcingJob } from '@/lib/engines/contact-engine/contact-queue';
import { ok, fail, handleRouteError } from '@/lib/http/respond';

export async function POST(req: Request) {
  try {
    const workspaceId = resolveWorkspaceId(req);
    const body = (await req.json().catch(() => ({}))) as { limit?: unknown };
    const limit = typeof body.limit === 'number' && body.limit > 0 ? Math.min(Math.floor(body.limit), 50) : 5;

    const all = await loadAccountsToProcess(workspaceId); // ordered tier asc, score desc
    if (all.length === 0) return fail('NOT_FOUND', 'No Tier-1/2 accounts on the TAL. Finalize a TAL first.');

    const accounts = all.slice(0, limit);
    for (const a of accounts) {
      await enqueueSourcingJob({ workspaceId, accountId: a.accountId, tier: a.tier, domain: a.domain, name: a.name });
    }
    return ok({ queued: accounts.length, message: `Sourcing enqueued for the top ${accounts.length} account${accounts.length === 1 ? '' : 's'} (of ${all.length}).` });
  } catch (e) {
    return handleRouteError(e);
  }
}
