import { Injectable, NestMiddleware, UnauthorizedException } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import { tenantStorage } from './tenant-context';

/**
 * Resolves the current org for the request and binds it to AsyncLocalStorage.
 *
 * Phase 0: pulls org_id from the `x-org-id` header (dev shortcut).
 * Phase 1: replaced by Supabase JWT verification → look up users.org_id.
 *
 * Health endpoints skip this middleware (see configure() in TenantModule).
 */
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction) {
    const headerOrg = req.header('x-org-id');
    if (!headerOrg) {
      throw new UnauthorizedException('Missing x-org-id (Phase 0 placeholder for auth)');
    }

    tenantStorage.run({ orgId: headerOrg }, () => next());
  }
}
