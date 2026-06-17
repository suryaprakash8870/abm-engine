/**
 * GET /api/v1/scoring/accounts
 * Returns account_scores joined with enriched_accounts for the workspace.
 */

import { resolveWorkspaceId } from '@/lib/auth/workspace';
import { prisma } from '@/lib/db/client';
import { ok, handleRouteError } from '@/lib/http/respond';

export async function GET(req: Request) {
  try {
    const workspaceId = resolveWorkspaceId(req);
    const scores = await prisma.accountScore.findMany({
      where: { workspaceId },
      orderBy: { totalScore: 'desc' },
    });

    const accountIds = scores.map((s) => s.accountId);
    const enriched = await prisma.enrichedAccount.findMany({
      where: { id: { in: accountIds } },
      select: { id: true, name: true, domain: true },
    });
    const enrichedMap = new Map(enriched.map((e) => [e.id, e]));

    const rows = scores.map((s) => ({
      id: s.accountId,
      name: enrichedMap.get(s.accountId)?.name ?? null,
      domain: enrichedMap.get(s.accountId)?.domain ?? s.accountId,
      totalScore: s.totalScore,
      tier: s.tier,
      criterionScores: s.criterionScores,
      formulaVersion: s.formulaVersion,
    }));

    return ok(rows);
  } catch (e) {
    return handleRouteError(e);
  }
}
