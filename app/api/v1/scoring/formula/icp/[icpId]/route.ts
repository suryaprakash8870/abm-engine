/**
 * GET /api/v1/scoring/formula/icp/:icpId
 * Fetch the active scoring formula for an ICP (or generate one if none exists).
 */

import { resolveWorkspaceId } from '@/lib/auth/workspace';
import { getOrGenerateFormula } from '@/lib/engines/scoring-engine/service';
import { ok, handleRouteError } from '@/lib/http/respond';

export async function GET(req: Request, { params }: { params: { icpId: string } }) {
  try {
    const workspaceId = resolveWorkspaceId(req);
    const formula = await getOrGenerateFormula(workspaceId, params.icpId);
    return ok(formula);
  } catch (e) {
    return handleRouteError(e);
  }
}
