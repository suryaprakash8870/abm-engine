/**
 * GET /api/v1/icp/:id  — fetch an ICP definition.
 * PUT /api/v1/icp/:id  — edit it (cuts a new version, publishes icp.updated).
 */

import { resolveWorkspaceId } from '@/lib/auth/workspace';
import { getIcp, reviseIcp } from '@/lib/engines/icp-engine/service';
import { publishIcpUpdated } from '@/lib/engines/icp-engine/publisher';
import { icpContentSchema } from '@/lib/engines/icp-engine/types';
import { ok, fail, handleRouteError } from '@/lib/http/respond';

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const workspaceId = resolveWorkspaceId(req);
    const icp = await getIcp(workspaceId, params.id);
    if (!icp) return fail('NOT_FOUND', 'ICP not found.');
    return ok(icp);
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  try {
    const workspaceId = resolveWorkspaceId(req);

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return fail('VALIDATION_ERROR', 'Request body must be valid JSON.');
    }

    // Partial update: any subset of the structured ICP content.
    const parsed = icpContentSchema.partial().safeParse(body);
    if (!parsed.success) {
      return fail('VALIDATION_ERROR', 'Invalid ICP fields.', parsed.error.flatten());
    }

    const result = await reviseIcp(workspaceId, params.id, parsed.data);
    if (!result) return fail('NOT_FOUND', 'ICP not found.');

    await publishIcpUpdated(
      {
        icp_id: result.def.icp_id,
        version: result.def.version,
        previous_version: result.previousVersion,
        changed_fields: result.changedFields,
        confidence_score: result.def.confidence_score,
        update_source: 'manual_edit',
      },
      { workspaceId },
    );

    return ok(result.def);
  } catch (e) {
    return handleRouteError(e);
  }
}
