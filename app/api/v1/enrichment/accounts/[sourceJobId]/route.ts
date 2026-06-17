/**
 * GET /api/v1/enrichment/accounts/:sourceJobId — enriched + qualified accounts for
 * a TAM build (keyed by the TAM job id). Returns { job, accounts } or job:null if
 * enrichment hasn't run for that build yet.
 */

import { resolveWorkspaceId } from '@/lib/auth/workspace';
import { getEnrichedAccountsForSourceJob } from '@/lib/engines/enrichment-engine/service';
import { ok, handleRouteError } from '@/lib/http/respond';

export async function GET(req: Request, { params }: { params: { sourceJobId: string } }) {
  try {
    const workspaceId = resolveWorkspaceId(req);
    const result = await getEnrichedAccountsForSourceJob(workspaceId, params.sourceJobId);
    return ok(result);
  } catch (e) {
    return handleRouteError(e);
  }
}
