/**
 * POST /api/v1/signals/test — fire a test signal (the "Test snippet" button).
 * Simulates a pricing-page hit for a TAL account so the user can confirm intake.
 */

import { resolveWorkspaceId } from '@/lib/auth/workspace';
import { prisma } from '@/lib/db/client';
import { buildTrackingSignal } from '@/lib/engines/signal-engine/service';
import { completionCheck } from '@/lib/engines/signal-engine/validation';
import { publishSignalReceived } from '@/lib/engines/signal-engine/publisher';
import { newCorrelationId } from '@/lib/events';
import { ok, fail, handleRouteError } from '@/lib/http/respond';

export async function POST(req: Request) {
  try {
    const workspaceId = resolveWorkspaceId(req);
    const body = (await req.json().catch(() => ({}))) as { account_id?: string };

    const acct = body.account_id
      ? await prisma.talAccount.findFirst({ where: { workspaceId, accountId: body.account_id }, select: { accountId: true } })
      : await prisma.talAccount.findFirst({ where: { workspaceId }, orderBy: { tier: 'asc' }, select: { accountId: true } });
    if (!acct) return fail('NOT_FOUND', 'No TAL accounts to test against. Finalize a TAL (Engine 05) first.');

    const result = await buildTrackingSignal(workspaceId, {
      ip: '203.0.113.10',
      url: 'https://your-website.com/pricing',
      sessionId: `test-${acct.accountId}`,
      userAgent: 'Mozilla/5.0 (test snippet)',
      accountId: acct.accountId,
    });

    if (result.status === 'published') {
      const check = completionCheck({ matchedToTalAccount: true, deduplicated: true, normalisedAndStored: true, eventPublished: true });
      if (check.ok) await publishSignalReceived(result.payload, { workspaceId, correlationId: newCorrelationId() });
    }

    return ok({
      status: result.status,
      account_id: acct.accountId,
      message:
        result.status === 'published' ? 'Test signal received — pricing_page_view recorded.'
        : result.status === 'duplicate' ? 'Test signal deduplicated (one per account+type per 5 min — dedup is working).'
        : 'Test signal discarded.',
    });
  } catch (e) {
    return handleRouteError(e);
  }
}
