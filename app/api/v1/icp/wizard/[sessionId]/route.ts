/**
 * GET /api/v1/icp/wizard/:sessionId — poll Mode A synthesis status.
 * Returns { status: processing | completed | failed, icp_id, error }.
 */

import { resolveWorkspaceId } from '@/lib/auth/workspace';
import { getWizardSession } from '@/lib/engines/icp-engine/synthesis-queue';
import { ok, fail, handleRouteError } from '@/lib/http/respond';

export async function GET(req: Request, { params }: { params: { sessionId: string } }) {
  try {
    const workspaceId = resolveWorkspaceId(req);
    const session = await getWizardSession(workspaceId, params.sessionId);
    if (!session) return fail('NOT_FOUND', 'Wizard session not found.');
    return ok({ status: session.status, icp_id: session.icpId, error: session.error });
  } catch (e) {
    return handleRouteError(e);
  }
}
