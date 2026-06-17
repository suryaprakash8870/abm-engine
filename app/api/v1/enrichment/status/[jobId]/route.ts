/** GET /api/v1/enrichment/status/:jobId — poll an enrichment job. */

import { resolveWorkspaceId } from '@/lib/auth/workspace';
import { getEnrichmentJob } from '@/lib/engines/enrichment-engine/service';
import { ok, fail, handleRouteError } from '@/lib/http/respond';

export async function GET(req: Request, { params }: { params: { jobId: string } }) {
  try {
    const workspaceId = resolveWorkspaceId(req);
    const job = await getEnrichmentJob(workspaceId, params.jobId);
    if (!job) return fail('NOT_FOUND', 'Enrichment job not found.');
    return ok(job);
  } catch (e) {
    return handleRouteError(e);
  }
}
