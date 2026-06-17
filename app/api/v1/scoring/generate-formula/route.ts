/**
 * POST /api/v1/scoring/generate-formula
 * AI-generate (or regenerate) a scoring formula from the workspace's active ICP.
 */

import { resolveWorkspaceId } from '@/lib/auth/workspace';
import { getOrGenerateFormula } from '@/lib/engines/scoring-engine/service';
import { prisma } from '@/lib/db/client';
import { ok, fail, handleRouteError } from '@/lib/http/respond';

export async function POST(req: Request) {
  try {
    const workspaceId = resolveWorkspaceId(req);
    const body = await req.json().catch(() => ({})) as { icp_id?: string };

    let icpId = body.icp_id;
    if (!icpId) {
      const icp = await prisma.icpDefinition.findFirst({
        where: { workspaceId },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      });
      if (!icp) return fail('NOT_FOUND', 'No ICP found for this workspace. Build one first.');
      icpId = icp.id;
    }

    // Delete existing formula so getOrGenerateFormula creates a fresh one.
    await prisma.scoringFormula.deleteMany({ where: { workspaceId, icpId } });

    const formula = await getOrGenerateFormula(workspaceId, icpId);
    return ok(formula);
  } catch (e) {
    return handleRouteError(e);
  }
}
