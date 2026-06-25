/**
 * POST /api/v1/demo/seed — populate every engine table for the caller's workspace
 * with realistic demo data so the platform can be walked through end-to-end.
 *
 * Idempotent: each call wipes existing rows and re-seeds the same state.
 */

import { resolveWorkspaceId } from '@/lib/auth/workspace';
import { seedDemoWorkspace } from '@/lib/engines/demo-seed/seed';
import { ok, handleRouteError } from '@/lib/http/respond';

export async function POST(req: Request) {
  try {
    const workspaceId = resolveWorkspaceId(req);
    const summary = await seedDemoWorkspace(workspaceId);
    return ok(summary);
  } catch (e) {
    return handleRouteError(e);
  }
}
