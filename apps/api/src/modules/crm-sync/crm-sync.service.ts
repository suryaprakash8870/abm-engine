import { Inject, Injectable, Logger } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { accounts, createDb } from '@abm/db';
import type { CrmProvider } from '@abm/shared';
import { DB_TOKEN } from '../../common/db/db.module';
import { CrmAdapterFactory } from '../crm-adapter/crm-adapter.factory';

type DbHandle = ReturnType<typeof createDb>;

/**
 * Pulls accounts from the customer's CRM and upserts them into our `accounts`
 * table — the bridge between the CRM Adapter (external source of truth) and
 * everything downstream (scoring, signals, dashboard).
 *
 * Phase 1 invariant: always idempotent. Re-running this for the same org
 * does not duplicate rows; it refreshes the row matched by (org_id, domain).
 * Companies without a domain are skipped with a warning — we need a stable
 * match key for upsert, and HubSpot's internal id alone isn't enough once
 * we start syncing from multiple CRMs.
 *
 * Hard rule #7: upsert never deletes existing fields. `onConflictDoUpdate`
 * only touches the columns in `.set()`. Enrichment data, scores, anything
 * downstream code wrote, stays intact.
 */
@Injectable()
export class CrmSyncService {
  private readonly logger = new Logger(CrmSyncService.name);

  constructor(
    @Inject(DB_TOKEN) private readonly dbHandle: DbHandle,
    private readonly crm: CrmAdapterFactory,
  ) {}

  async syncAccountsForOrg(orgId: string, provider: CrmProvider): Promise<{
    pages: number;
    fetched: number;
    upserted: number;
    skippedNoDomain: number;
  }> {
    const adapter = this.crm.forProvider(provider);
    const db = this.dbHandle.db;

    let cursor: string | undefined;
    let pages = 0;
    let fetched = 0;
    let upserted = 0;
    let skippedNoDomain = 0;

    do {
      const page = await adapter.getAccounts({ cursor, limit: 100 });
      pages += 1;
      fetched += page.accounts.length;

      for (const a of page.accounts) {
        if (!a.domain) {
          this.logger.warn(
            `Skipping ${provider} account ${a.externalId} (${a.name ?? 'unnamed'}) — no domain`,
          );
          skippedNoDomain += 1;
          continue;
        }

        await db
          .insert(accounts)
          .values({
            orgId,
            domain: a.domain.toLowerCase(),
            name: a.name ?? null,
            externalCrmId: a.externalId,
            externalCrmProvider: provider,
            enrichment: (a.properties ?? null) as Record<string, unknown> | null,
          })
          .onConflictDoUpdate({
            target: [accounts.orgId, accounts.domain],
            set: {
              name: a.name ?? null,
              externalCrmId: a.externalId,
              externalCrmProvider: provider,
              enrichment: (a.properties ?? null) as Record<string, unknown> | null,
              updatedAt: sql`now()`,
            },
          });
        upserted += 1;
      }

      cursor = page.nextCursor;
    } while (cursor);

    this.logger.log(
      `Sync done for org=${orgId} provider=${provider}: pages=${pages} fetched=${fetched} upserted=${upserted} skipped=${skippedNoDomain}`,
    );
    return { pages, fetched, upserted, skippedNoDomain };
  }
}
