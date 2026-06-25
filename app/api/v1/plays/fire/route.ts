/** POST /api/v1/plays/fire — manually trigger a play for an account. */

import { resolveWorkspaceId } from '@/lib/auth/workspace';
import { fireManualPlay } from '@/lib/engines/demand-gen-orchestrator/service';
import { publishPlayFired } from '@/lib/engines/demand-gen-orchestrator/publisher';
import { notifyPlayFired } from '@/lib/engines/demand-gen-orchestrator/notify';
import { newCorrelationId } from '@/lib/events';
import { ok, fail, handleRouteError } from '@/lib/http/respond';

export async function POST(req: Request) {
  try {
    const workspaceId = resolveWorkspaceId(req);
    const body = await req.json().catch(() => ({}));
    if (!body?.account_id) return fail('VALIDATION_ERROR', 'account_id is required.');

    const correlationId = newCorrelationId();
    const result = await fireManualPlay(workspaceId, { account_id: body.account_id, stage: body.stage, trigger_type: body.trigger_type }, correlationId);

    if (result.status === 'fired') {
      await publishPlayFired(result.payload, { workspaceId, correlationId });
      await notifyPlayFired(workspaceId, result.payload); // best-effort Telegram alert
      return ok({ status: 'fired', play: result.payload });
    }
    return ok({ status: result.status, reason: result.reason });
  } catch (e) {
    return handleRouteError(e);
  }
}
