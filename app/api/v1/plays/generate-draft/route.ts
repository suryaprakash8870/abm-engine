/** POST /api/v1/plays/generate-draft — AI email draft for a play (Sonnet, fallback template). */

import { resolveWorkspaceId } from '@/lib/auth/workspace';
import { generateAiDraft } from '@/lib/engines/demand-gen-orchestrator/service';
import { ok, fail, handleRouteError } from '@/lib/http/respond';

export async function POST(req: Request) {
  try {
    const workspaceId = resolveWorkspaceId(req);
    const body = await req.json().catch(() => ({}));
    if (!body?.play_id) return fail('VALIDATION_ERROR', 'play_id is required.');
    const draft = await generateAiDraft(workspaceId, body.play_id);
    return ok({ subject_lines: draft.subjectLines, body: draft.body, model_used: draft.modelUsed });
  } catch (e) {
    return handleRouteError(e);
  }
}
