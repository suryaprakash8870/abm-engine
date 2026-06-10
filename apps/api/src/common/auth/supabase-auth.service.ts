import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import * as jwt from 'jsonwebtoken';
import { eq } from 'drizzle-orm';
import { createDb, organizations, users } from '@abm/db';
import { DB_TOKEN } from '../db/db.module';

type DbHandle = ReturnType<typeof createDb>;

export interface SupabaseTokenPayload {
  /** Supabase auth user id (uuid). */
  sub: string;
  email: string;
}

export interface ResolvedPrincipal {
  orgId: string;
  userId: string;
}

/**
 * Supabase Auth integration (ADR-016 / ADR-018).
 *
 * Verifies Supabase-issued JWTs locally with SUPABASE_JWT_SECRET (HS256) —
 * no network round-trip per request. The secret lives in the Supabase
 * dashboard under Settings → API → JWT Secret.
 *
 * NOTE: Supabase projects created after mid-2025 may use asymmetric signing
 * keys (ES256/JWKS) instead of the legacy HS256 secret. If verification
 * fails on a fresh project, swap this for JWKS verification — tracked in
 * DECISIONS.md ADR-018.
 */
@Injectable()
export class SupabaseAuthService {
  private readonly logger = new Logger(SupabaseAuthService.name);
  private readonly jwtSecret: string | undefined;

  constructor(
    config: ConfigService,
    @Inject(DB_TOKEN) private readonly dbHandle: DbHandle,
  ) {
    this.jwtSecret = config.get<string>('SUPABASE_JWT_SECRET');
  }

  get isConfigured(): boolean {
    return Boolean(this.jwtSecret);
  }

  /** Verify an access token. Returns null on any failure — caller picks the HTTP shape. */
  verifyToken(token: string): SupabaseTokenPayload | null {
    if (!this.jwtSecret) return null;
    try {
      const payload = jwt.verify(token, this.jwtSecret, {
        algorithms: ['HS256'],
      }) as jwt.JwtPayload;
      if (!payload.sub) return null;
      return { sub: payload.sub, email: (payload.email as string) ?? '' };
    } catch {
      return null;
    }
  }

  /**
   * Map a verified Supabase user to an org + app user row.
   *
   * First login auto-provisions: a new org (named from the email domain) with
   * this user as owner. This keeps onboarding self-serve in Phase 1 — no
   * admin step between "signed up" and "using the product". Invite flows
   * (joining an EXISTING org) come later with the settings page.
   */
  async resolveUser(payload: SupabaseTokenPayload): Promise<ResolvedPrincipal> {
    const db = this.dbHandle.db;

    const [existing] = await db
      .select({ id: users.id, orgId: users.orgId })
      .from(users)
      .where(eq(users.supabaseUserId, payload.sub))
      .limit(1);
    if (existing) return { orgId: existing.orgId, userId: existing.id };

    const provisioned = await db.transaction(async (tx) => {
      const orgName = orgNameFromEmail(payload.email);
      const [org] = await tx
        .insert(organizations)
        .values({
          name: orgName,
          // Random suffix guarantees slug uniqueness without a retry loop.
          slug: `${slugify(orgName)}-${randomUUID().slice(0, 8)}`,
        })
        .returning({ id: organizations.id });

      const [user] = await tx
        .insert(users)
        .values({
          orgId: org.id,
          supabaseUserId: payload.sub,
          email: payload.email,
          role: 'owner',
        })
        // Lost a concurrent first-login race — surface it as a conflict and
        // re-select below rather than failing the request.
        .onConflictDoNothing({ target: users.supabaseUserId })
        .returning({ id: users.id, orgId: users.orgId });

      return user ?? null;
    });

    if (provisioned) {
      this.logger.log(
        `Auto-provisioned org=${provisioned.orgId} for new user ${payload.email}`,
      );
      return { orgId: provisioned.orgId, userId: provisioned.id };
    }

    // Concurrent request provisioned this user first — read their row.
    const [raced] = await db
      .select({ id: users.id, orgId: users.orgId })
      .from(users)
      .where(eq(users.supabaseUserId, payload.sub))
      .limit(1);
    if (!raced) {
      throw new Error(`User provisioning failed for supabase user ${payload.sub}`);
    }
    return { orgId: raced.orgId, userId: raced.id };
  }
}

function orgNameFromEmail(email: string): string {
  const domain = email.split('@')[1];
  if (!domain) return 'My Organization';
  const base = domain.split('.')[0];
  // Personal-mail domains say nothing about the company — fall back to the
  // mailbox name ("jane.doe@gmail.com" → "jane.doe's org").
  const personal = new Set(['gmail', 'outlook', 'yahoo', 'hotmail', 'proton', 'protonmail', 'icloud', 'live', 'aol']);
  if (personal.has(base.toLowerCase())) {
    const local = email.split('@')[0];
    return `${local}'s org`;
  }
  return base.charAt(0).toUpperCase() + base.slice(1);
}

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'org'
  );
}
