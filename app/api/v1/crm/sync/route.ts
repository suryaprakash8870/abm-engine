/**
 * POST /api/v1/crm/sync — manual "Push to HubSpot" (CRM as OUTPUT).
 *
 * On-demand: writes the current TAL accounts (+ tiers/scores) and their mapped
 * contacts back to the CRM, reusing the same writeRecords path the event
 * handlers use. Session-gated. Live against HUBSPOT_SERVICE_KEY / a connection,
 * else mock. For demos: click → switch to HubSpot → records appear.
 */

import { resolveWorkspaceId } from '@/lib/auth/workspace';
import { syncTalToCrm } from '@/lib/engines/crm-sync-engine/service';
import { newCorrelationId } from '@/lib/events';
import { ok, handleRouteError } from '@/lib/http/respond';

export async function POST(req: Request) {
  try {
    const workspaceId = resolveWorkspaceId(req);
    const summary = await syncTalToCrm(workspaceId, newCorrelationId());
    return ok(summary);
  } catch (e) {
    return handleRouteError(e);
  }
}
