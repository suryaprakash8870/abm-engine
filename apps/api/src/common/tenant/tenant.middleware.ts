import { Injectable, NestMiddleware, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response, NextFunction } from 'express';
import { SupabaseAuthService } from '../auth/supabase-auth.service';
import { tenantStorage } from './tenant-context';

/**
 * Resolves the current org for the request and binds it to AsyncLocalStorage.
 *
 * Primary path (Phase 1, ADR-018): `Authorization: Bearer <supabase-jwt>` →
 * verify locally (HS256) → resolve org/user from the `users` table
 * (auto-provisioning a new org on first login).
 *
 * Dev fallback: the Phase 0 `x-org-id` header still works, but ONLY outside
 * production — so seeded-data flows and curl testing stay friction-free
 * without ever being a production bypass.
 *
 * Health endpoints skip this middleware (see configure() in TenantModule).
 */
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  private readonly isProduction: boolean;

  constructor(
    private readonly auth: SupabaseAuthService,
    config: ConfigService,
  ) {
    this.isProduction = config.get<string>('NODE_ENV') === 'production';
  }

  async use(req: Request, _res: Response, next: NextFunction) {
    const authHeader = req.header('authorization');
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice('Bearer '.length).trim();
      const payload = this.auth.verifyToken(token);
      if (!payload) {
        throw new UnauthorizedException(
          this.auth.isConfigured
            ? 'Invalid or expired access token'
            : 'Auth not configured on the API — set SUPABASE_JWT_SECRET',
        );
      }
      const principal = await this.auth.resolveUser(payload);
      return tenantStorage.run(
        { orgId: principal.orgId, userId: principal.userId },
        () => next(),
      );
    }

    const headerOrg = req.header('x-org-id');
    if (headerOrg && !this.isProduction) {
      return tenantStorage.run({ orgId: headerOrg }, () => next());
    }

    throw new UnauthorizedException('Missing Authorization: Bearer <token>');
  }
}
