/** PUT /api/v1/contacts/:id/role — change a contact's stakeholder role. */

import { resolveWorkspaceId } from '@/lib/auth/workspace';
import { updateContactRole, type StakeholderRole } from '@/lib/engines/contact-engine/service';
import { ok, fail, handleRouteError } from '@/lib/http/respond';

const ROLES: StakeholderRole[] = ['decision_maker', 'champion', 'influencer'];

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  try {
    const workspaceId = resolveWorkspaceId(req);
    const body = await req.json().catch(() => ({}));
    const role = body?.role;
    if (!ROLES.includes(role)) return fail('VALIDATION_ERROR', `role must be one of: ${ROLES.join(', ')}`);
    await updateContactRole(workspaceId, params.id, role);
    return ok({ id: params.id, role });
  } catch (e) {
    return handleRouteError(e);
  }
}
