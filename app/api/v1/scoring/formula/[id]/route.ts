/**
 * PUT /api/v1/scoring/formula/:id
 * Update formula weights/boundaries — cuts a new version.
 */

import { resolveWorkspaceId } from '@/lib/auth/workspace';
import { updateFormula } from '@/lib/engines/scoring-engine/service';
import { ok, fail, handleRouteError } from '@/lib/http/respond';

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  try {
    const workspaceId = resolveWorkspaceId(req);
    const body = await req.json().catch(() => ({}));
    if (!body || typeof body !== 'object') return fail('VALIDATION_ERROR', 'Request body must be JSON.');
    const formula = await updateFormula(workspaceId, params.id, body);
    return ok(formula);
  } catch (e) {
    return handleRouteError(e);
  }
}
