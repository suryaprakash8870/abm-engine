/**
 * GET /api/v1/scoring/distribution
 * Tier distribution stats for the workspace.
 */

import { resolveWorkspaceId } from '@/lib/auth/workspace';
import { getTierDistribution } from '@/lib/engines/scoring-engine/service';
import { ok, handleRouteError } from '@/lib/http/respond';

export async function GET(req: Request) {
  try {
    const workspaceId = resolveWorkspaceId(req);
    const dist = await getTierDistribution(workspaceId);
    return ok(dist);
  } catch (e) {
    return handleRouteError(e);
  }
}
