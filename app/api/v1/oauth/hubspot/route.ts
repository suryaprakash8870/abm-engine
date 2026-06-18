/**
 * POST   /api/v1/oauth/hubspot — connect HubSpot.
 * DELETE /api/v1/oauth/hubspot — disconnect HubSpot.
 *
 * MVP: POST establishes a MOCK connection (no real OAuth app) so the pipeline +
 * Settings UI work end-to-end. POST (not GET) because it mutates — a GET would be
 * CSRF-triggerable. A live build redirects to HubSpot's consent screen and finishes
 * in the callback route.
 */

import { resolveWorkspaceId } from '@/lib/auth/workspace';
import { connectCrmMock, disconnectCrm } from '@/lib/engines/crm-sync-engine/service';
import { ok, handleRouteError } from '@/lib/http/respond';

export async function POST(req: Request) {
  try {
    const workspaceId = resolveWorkspaceId(req);
    return ok(await connectCrmMock(workspaceId, 'hubspot'));
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function DELETE(req: Request) {
  try {
    const workspaceId = resolveWorkspaceId(req);
    await disconnectCrm(workspaceId, 'hubspot');
    return ok({ connected: false });
  } catch (e) {
    return handleRouteError(e);
  }
}
