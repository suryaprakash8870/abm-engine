/**
 * POST /api/v1/signals/research — run 3rd-party web research for a TAL account.
 *
 * Scrapes the account's site (Firecrawl) → extracts buying signals with the local
 * LLM → ingests them as `research` signals → publishes signal.received for each
 * new one (verify-before-publish). Session-authed (not the public token).
 *
 * Body: { account_id?: string }. With no account_id, researches the top-tier
 * TAL account (handy for a one-click demo). Live Firecrawl/LLM calls cost
 * credits — set FIRECRAWL_SOURCE=mock and LLM_PROVIDER=mock to run for free.
 */

import { resolveWorkspaceId } from '@/lib/auth/workspace';
import { prisma } from '@/lib/db/client';
import { researchAccount } from '@/lib/engines/signal-engine/research';
import { completionCheck } from '@/lib/engines/signal-engine/validation';
import { publishSignalReceived } from '@/lib/engines/signal-engine/publisher';
import { newCorrelationId } from '@/lib/events';
import { ok, fail, handleRouteError } from '@/lib/http/respond';

export async function POST(req: Request) {
  try {
    const workspaceId = resolveWorkspaceId(req);
    const body = (await req.json().catch(() => ({}))) as { account_id?: string };

    const acct = body.account_id
      ? await prisma.talAccount.findFirst({ where: { workspaceId, accountId: body.account_id }, select: { accountId: true, name: true, domain: true } })
      : await prisma.talAccount.findFirst({ where: { workspaceId }, orderBy: { tier: 'asc' }, select: { accountId: true, name: true, domain: true } });
    if (!acct) return fail('NOT_FOUND', 'No TAL accounts to research. Finalize a TAL (Engine 05) first.');

    const result = await researchAccount(workspaceId, acct);

    // Publish signal.received for each newly-stored research signal.
    const correlationId = newCorrelationId();
    let published = 0;
    for (const r of result.ingested) {
      if (r.status === 'published') {
        const check = completionCheck({ matchedToTalAccount: true, deduplicated: true, normalisedAndStored: true, eventPublished: true });
        if (check.ok) {
          await publishSignalReceived(r.payload, { workspaceId, correlationId });
          published += 1;
        }
      }
    }

    return ok({
      account_id: acct.accountId,
      account_name: acct.name,
      scraped: result.scraped,
      source: result.source,
      model_used: result.modelUsed,
      url: result.url,
      findings: result.findings,
      published,
      duplicates: result.ingested.filter((r) => r.status === 'duplicate').length,
      discarded: result.ingested.filter((r) => r.status === 'discarded').length,
    });
  } catch (e) {
    return handleRouteError(e);
  }
}
