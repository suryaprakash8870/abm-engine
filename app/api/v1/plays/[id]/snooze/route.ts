/** POST /api/v1/plays/:id/snooze — snooze a play (and its account) for N days. */

import { resolveWorkspaceId } from '@/lib/auth/workspace';
import { snoozePlay } from '@/lib/engines/demand-gen-orchestrator/service';
import { ok, handleRouteError } from '@/lib/http/respond';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const workspaceId = resolveWorkspaceId(req);
    const body = await req.json().catch(() => ({}));
    const days = Number(body?.days ?? 7);
    return ok(await snoozePlay(workspaceId, params.id, Number.isFinite(days) ? days : 7));
  } catch (e) {
    return handleRouteError(e);
  }
}
