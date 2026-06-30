/**
 * POST /api/v1/icp/wizard — Mode A.
 *
 * Submit the 12 wizard answers. We validate, persist a wizard_session, and enqueue
 * async Claude synthesis (never inline — CLAUDE.md rule 5). Returns 202 with a
 * session id to poll. `icp.created` is published by the worker on success.
 */

import { resolveWorkspaceId } from '@/lib/auth/workspace';
import { wizardAnswersSchema } from '@/lib/engines/icp-engine/types';
import { startWizardSynthesis } from '@/lib/engines/icp-engine/synthesis-queue';
import { ok, fail, handleRouteError } from '@/lib/http/respond';

export async function POST(req: Request) {
  try {
    const workspaceId = resolveWorkspaceId(req);

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return fail('VALIDATION_ERROR', 'Request body must be valid JSON.');
    }

    // Accept either { answers: {...} } or the answers object directly.
    const raw = (body as { answers?: unknown })?.answers ?? body;
    const parsed = wizardAnswersSchema.safeParse(raw);
    if (!parsed.success) {
      return fail('VALIDATION_ERROR', 'Wizard answers are incomplete.', parsed.error.flatten());
    }

    // Optional: refine an existing ICP (cut a new version) instead of creating a new one.
    const refineRaw = (body as { refine_icp_id?: unknown })?.refine_icp_id;
    const refineIcpId = typeof refineRaw === 'string' && refineRaw.length > 0 ? refineRaw : undefined;

    const { sessionId } = await startWizardSynthesis(workspaceId, parsed.data, refineIcpId);
    return ok({ session_id: sessionId, status: 'processing' }, 202);
  } catch (e) {
    return handleRouteError(e);
  }
}
