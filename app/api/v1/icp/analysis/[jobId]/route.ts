/**
 * GET /api/v1/icp/analysis/:jobId — poll Mode B/C analysis status.
 * Returns { status, crm_type, deal_count, result }.
 */

import { resolveWorkspaceId } from '@/lib/auth/workspace';
import { getAnalysisJob } from '@/lib/engines/icp-engine/analysis-queue';
import { ok, fail, handleRouteError } from '@/lib/http/respond';

export async function GET(req: Request, { params }: { params: { jobId: string } }) {
  try {
    const workspaceId = resolveWorkspaceId(req);
    const job = await getAnalysisJob(workspaceId, params.jobId);
    if (!job) return fail('NOT_FOUND', 'Analysis job not found.');
    return ok({ status: job.status, crm_type: job.crmType, deal_count: job.dealCount, result: job.result });
  } catch (e) {
    return handleRouteError(e);
  }
}
