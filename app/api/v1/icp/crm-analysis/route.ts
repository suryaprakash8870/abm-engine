/**
 * POST /api/v1/icp/crm-analysis — Mode B.
 *
 * Pull closed-won/lost deals from the workspace's CRM, then queue statistical
 * analysis + Claude interpretation → `icp.created`. Reading deals needs Engine 10's
 * OAuth token; until that lands this returns 424 (CRM not connected).
 */

import { resolveWorkspaceId } from '@/lib/auth/workspace';
import { fetchClosedDeals, CrmNotConnectedError } from '@/lib/engines/icp-engine/crm-source';
import { startCrmAnalysis } from '@/lib/engines/icp-engine/analysis-queue';
import { ok, fail, handleRouteError } from '@/lib/http/respond';

export async function POST(req: Request) {
  try {
    const workspaceId = resolveWorkspaceId(req);

    let deals;
    try {
      deals = await fetchClosedDeals(workspaceId);
    } catch (e) {
      if (e instanceof CrmNotConnectedError) return fail('CRM_NOT_CONNECTED', e.message);
      throw e;
    }

    const { jobId } = await startCrmAnalysis(workspaceId, 'hubspot', deals);
    return ok({ job_id: jobId, status: 'processing' }, 202);
  } catch (e) {
    return handleRouteError(e);
  }
}
