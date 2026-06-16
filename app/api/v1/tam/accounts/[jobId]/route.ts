/** GET /api/v1/tam/accounts/:jobId — the raw account list a build produced. */

import { resolveWorkspaceId } from '@/lib/auth/workspace';
import { getTamJob, getRawAccounts } from '@/lib/engines/tam-builder/build-queue';
import { ok, fail, handleRouteError } from '@/lib/http/respond';

export async function GET(req: Request, { params }: { params: { jobId: string } }) {
  try {
    const workspaceId = resolveWorkspaceId(req);
    const job = await getTamJob(workspaceId, params.jobId);
    if (!job) return fail('NOT_FOUND', 'TAM build not found.');
    const accounts = await getRawAccounts(workspaceId, params.jobId);
    return ok({ job, count: accounts.length, accounts });
  } catch (e) {
    return handleRouteError(e);
  }
}
