/**
 * Workspace resolution for API routes.
 *
 * PHASE-0 PLACEHOLDER. The foundation owner (Vicky) replaces this with real
 * Supabase Auth: read the session, verify the JWT, and take `workspace_id` from
 * the JWT claim — NEVER from a request parameter (conventions.md). Until then,
 * routes resolve the workspace from an `x-workspace-id` header so engine owners
 * can build and test against the contracts.
 */

export class UnauthorizedError extends Error {
  constructor(message = 'Unauthorized') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

/** Resolve the caller's workspace id, or throw UnauthorizedError. */
export function resolveWorkspaceId(req: Request): string {
  // TODO(foundation/auth): replace with Supabase session → JWT workspace_id claim.
  const ws = req.headers.get('x-workspace-id');
  if (!ws || ws.trim() === '') {
    throw new UnauthorizedError(
      'Workspace not resolved. Auth is not wired yet — send an x-workspace-id header for now.',
    );
  }
  return ws;
}
