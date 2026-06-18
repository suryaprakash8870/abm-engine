/** GET /api/v1/signals/token — get (or create) this workspace's tracking token + snippet. */

import { resolveWorkspaceId } from '@/lib/auth/workspace';
import { getOrCreateTrackingToken } from '@/lib/engines/signal-engine/service';
import { ok, handleRouteError } from '@/lib/http/respond';

export async function GET(req: Request) {
  try {
    const workspaceId = resolveWorkspaceId(req);
    const token = await getOrCreateTrackingToken(workspaceId);
    const origin = new URL(req.url).origin;
    return ok({
      token,
      snippet_url: `${origin}/api/v1/signals/snippet/${token}`,
      snippet: `<script async src="${origin}/api/v1/signals/snippet/${token}"></script>`,
    });
  } catch (e) {
    return handleRouteError(e);
  }
}
