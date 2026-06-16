/**
 * GET /api/v1/tam/latest/:icpId — the latest TAM build for an ICP (or null).
 * Used by the ICP page to surface the account-list build status + a link.
 */

import { resolveWorkspaceId } from '@/lib/auth/workspace';
import { getLatestJobForIcp } from '@/lib/engines/tam-builder/build-queue';
import { ok, handleRouteError } from '@/lib/http/respond';

export async function GET(req: Request, { params }: { params: { icpId: string } }) {
  try {
    const workspaceId = resolveWorkspaceId(req);
    const latest = await getLatestJobForIcp(workspaceId, params.icpId);
    if (!latest) return ok(null);
    return ok({ job_id: latest.id, status: latest.status, total_found: latest.totalFound });
  } catch (e) {
    return handleRouteError(e);
  }
}
