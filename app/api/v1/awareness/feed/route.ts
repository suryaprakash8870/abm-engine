/** GET /api/v1/awareness/feed — hot accounts ranked by score (filters: min_score, stage). */

import { resolveWorkspaceId } from '@/lib/auth/workspace';
import { getFeed } from '@/lib/engines/awareness-engine/service';
import { ok, handleRouteError } from '@/lib/http/respond';

export async function GET(req: Request) {
  try {
    const workspaceId = resolveWorkspaceId(req);
    const url = new URL(req.url);
    const minScore = url.searchParams.get('min_score');
    const stage = url.searchParams.get('stage');
    return ok(await getFeed(workspaceId, { minScore: minScore ? Number(minScore) : undefined, stage: stage ?? undefined }));
  } catch (e) {
    return handleRouteError(e);
  }
}
