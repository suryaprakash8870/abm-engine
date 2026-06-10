import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';
import { accounts, createDb } from '@abm/db';
import { DB_TOKEN } from '../../common/db/db.module';
import { getCurrentTenant } from '../../common/tenant/tenant-context';

type DbHandle = ReturnType<typeof createDb>;

/**
 * Application-layer org_id filtering. We still SELECT with `where org_id = X`
 * even though Drizzle's superuser connection bypasses RLS — defense in depth.
 * When we swap to the `abm_app` role for runtime, the RLS policies will catch
 * any missed filter as a backstop.
 */
@Injectable()
export class AccountsService {
  constructor(@Inject(DB_TOKEN) private readonly dbHandle: DbHandle) {}

  async listForCurrentOrg(opts: { search?: string; limit?: number } = {}) {
    const { orgId } = getCurrentTenant();
    const limit = Math.min(opts.limit ?? 200, 500);

    const rows = await this.dbHandle.db
      .select({
        id: accounts.id,
        domain: accounts.domain,
        name: accounts.name,
        externalCrmId: accounts.externalCrmId,
        externalCrmProvider: accounts.externalCrmProvider,
        enrichment: accounts.enrichment,
        enrichedAt: accounts.enrichedAt,
        createdAt: accounts.createdAt,
        updatedAt: accounts.updatedAt,
      })
      .from(accounts)
      .where(eq(accounts.orgId, orgId))
      .orderBy(asc(accounts.domain))
      .limit(limit);

    return rows.map((r) => ({
      id: r.id,
      domain: r.domain,
      name: r.name,
      externalCrmId: r.externalCrmId,
      externalCrmProvider: r.externalCrmProvider,
      // Surface the most common firmographic properties from the enrichment bag
      // so the dashboard doesn't have to know about CRM-specific shapes.
      industry: pickProp(r.enrichment, 'industry'),
      employees: pickProp(r.enrichment, 'numberofemployees'),
      country: pickProp(r.enrichment, 'country'),
      website: pickProp(r.enrichment, 'website'),
      enrichedAt: r.enrichedAt,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  }
}

function pickProp(enrichment: unknown, key: string): string | null {
  if (!enrichment || typeof enrichment !== 'object') return null;
  const value = (enrichment as Record<string, unknown>)[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}
