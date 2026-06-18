/** PUT /api/v1/plays/:id/outcome — log a play outcome (publishes play.outcome_recorded). */

import { resolveWorkspaceId } from '@/lib/auth/workspace';
import { recordOutcome } from '@/lib/engines/demand-gen-orchestrator/service';
import { publishPlayOutcomeRecorded } from '@/lib/engines/demand-gen-orchestrator/publisher';
import { newCorrelationId } from '@/lib/events';
import { ok, fail, handleRouteError } from '@/lib/http/respond';

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  try {
    const workspaceId = resolveWorkspaceId(req);
    const body = await req.json().catch(() => ({}));
    if (!body?.outcome) return fail('VALIDATION_ERROR', 'outcome is required.');

    const payload = await recordOutcome(workspaceId, params.id, body.outcome, body.notes ?? null);
    await publishPlayOutcomeRecorded(payload, { workspaceId, correlationId: newCorrelationId() });
    return ok(payload);
  } catch (e) {
    return handleRouteError(e);
  }
}
