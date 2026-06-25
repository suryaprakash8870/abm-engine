/**
 * POST /api/v1/demo/reset — wipe every engine table for the caller's workspace.
 * Symmetric with /demo/seed: returns the workspace to the same empty state a
 * brand-new sign-up has.
 */

import { resolveWorkspaceId } from '@/lib/auth/workspace';
import { resetDemoWorkspace } from '@/lib/engines/demo-seed/seed';
import { ok, handleRouteError } from '@/lib/http/respond';

export async function POST(req: Request) {
  try {
    const workspaceId = resolveWorkspaceId(req);
    await resetDemoWorkspace(workspaceId);
    return ok({ workspaceId, reset: true });
  } catch (e) {
    return handleRouteError(e);
  }
}
