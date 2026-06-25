/**
 * POST /api/v1/crm/import — import from the CRM (HubSpot as INPUT).
 *
 * Reads companies / contacts / deals; republishes closed-won/lost deals as
 * crm.deal_closed_* events (→ ICP refresh + GTM Flywheel). Session-gated.
 * Runs against the live HubSpot token when connected, else returns mock sample.
 */

import { resolveWorkspaceId } from '@/lib/auth/workspace';
import { importFromCrm } from '@/lib/engines/crm-sync-engine/service';
import { newCorrelationId } from '@/lib/events';
import { ok, handleRouteError } from '@/lib/http/respond';

export async function POST(req: Request) {
  try {
    const workspaceId = resolveWorkspaceId(req);
    const summary = await importFromCrm(workspaceId, newCorrelationId());
    return ok(summary);
  } catch (e) {
    return handleRouteError(e);
  }
}
