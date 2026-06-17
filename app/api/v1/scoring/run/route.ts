/**
 * POST /api/v1/scoring/run
 * Manually trigger scoring on all qualified enriched accounts for a workspace.
 */

import { resolveWorkspaceId } from '@/lib/auth/workspace';
import { prisma } from '@/lib/db/client';
import { enqueueScoringJob } from '@/lib/engines/scoring-engine/scoring-queue';
import { ok, fail, handleRouteError } from '@/lib/http/respond';

export async function POST(req: Request) {
  try {
    const workspaceId = resolveWorkspaceId(req);

    const icp = await prisma.icpDefinition.findFirst({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    if (!icp) return fail('NOT_FOUND', 'No ICP found. Build one first.');

    // qualified lives in qualification_results, not enriched_accounts — join via accountId
    const qualifiedAccountIds = (
      await prisma.qualificationResult.findMany({
        where: { workspaceId, qualified: true },
        select: { accountId: true },
      })
    ).map((q) => q.accountId);

    const accounts = await prisma.enrichedAccount.findMany({
      where: { workspaceId, accountId: { in: qualifiedAccountIds } },
      select: { id: true },
    });
    if (accounts.length === 0) return fail('NOT_FOUND', 'No qualified accounts found to score.');

    await enqueueScoringJob({
      workspaceId,
      icpId: icp.id,
      accountIds: accounts.map((a) => a.id),
      sourceJobId: 'manual',
    });

    return ok({ queued: accounts.length, message: 'Scoring job enqueued.' });
  } catch (e) {
    return handleRouteError(e);
  }
}
