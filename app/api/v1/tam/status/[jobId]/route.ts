/** GET /api/v1/tam/status/:jobId — poll a TAM build job. */

import { resolveWorkspaceId } from '@/lib/auth/workspace';
import { getTamJob } from '@/lib/engines/tam-builder/build-queue';
import { ok, fail, handleRouteError } from '@/lib/http/respond';

export async function GET(req: Request, { params }: { params: { jobId: string } }) {
  try {
    const workspaceId = resolveWorkspaceId(req);
    const job = await getTamJob(workspaceId, params.jobId);
    if (!job) return fail('NOT_FOUND', 'TAM build not found.');
    return ok(job);
  } catch (e) {
    return handleRouteError(e);
  }
}
