/**
 * GET /api/v1/workspace  — the caller's workspace (id + name).
 * PUT /api/v1/workspace  — rename the workspace ({ name }).
 *
 * Workspace is the org-identity record; name feeds ICP synthesis context and the
 * UI. Tenant comes from the session, never a parameter.
 */

import { resolveWorkspaceId } from '@/lib/auth/workspace';
import { prisma } from '@/lib/db/client';
import { ok, fail, handleRouteError } from '@/lib/http/respond';

export async function GET(req: Request) {
  try {
    const workspaceId = resolveWorkspaceId(req);
    const ws = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { id: true, name: true } });
    if (!ws) return fail('NOT_FOUND', 'Workspace not found.');
    return ok(ws);
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function PUT(req: Request) {
  try {
    const workspaceId = resolveWorkspaceId(req);
    const body = (await req.json().catch(() => ({}))) as { name?: unknown };
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (name.length < 2 || name.length > 80) return fail('VALIDATION_ERROR', 'Workspace name must be 2–80 characters.');
    const ws = await prisma.workspace.update({ where: { id: workspaceId }, data: { name }, select: { id: true, name: true } });
    return ok(ws);
  } catch (e) {
    return handleRouteError(e);
  }
}
