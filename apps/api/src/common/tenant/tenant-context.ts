import { AsyncLocalStorage } from 'node:async_hooks';

export interface TenantContext {
  orgId: string;
  userId?: string;
}

/**
 * AsyncLocalStorage-backed tenant context.
 *
 * Set once per request (TenantMiddleware) or per job (the worker wrapper).
 * Anything downstream that touches the DB reads orgId from here and binds
 * `app.current_org_id` on the connection so RLS enforces isolation.
 *
 * Never read tenant from a parameter or header below the controller layer —
 * always use this. Skipping it bypasses RLS and is a tenancy bug.
 */
export const tenantStorage = new AsyncLocalStorage<TenantContext>();

export function getCurrentTenant(): TenantContext {
  const ctx = tenantStorage.getStore();
  if (!ctx) {
    throw new Error(
      'No tenant context. Wrap the call in tenantStorage.run({ orgId }, fn).',
    );
  }
  return ctx;
}

export function runWithTenant<T>(ctx: TenantContext, fn: () => Promise<T> | T): Promise<T> | T {
  return tenantStorage.run(ctx, fn);
}
