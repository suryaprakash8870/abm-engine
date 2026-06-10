import { Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, eq, sql } from 'drizzle-orm';
import { accounts, createDb, scores } from '@abm/db';
import { DB_TOKEN } from '../../common/db/db.module';
import { ScoringService } from '../scoring/scoring.service';

type DbHandle = ReturnType<typeof createDb>;

export interface TamSearchCriteria {
  industry?: string;
  employeesMin?: number;
  employeesMax?: number;
  country?: string;
  limit?: number;
}

/**
 * TAM Map builder (Playbook Step 3) — prospect companies that are NOT yet in
 * the customer's CRM, sourced via Apollo's company search.
 *
 * Key-gated (ADR-014): Apollo search needs a paid plan. Without
 * APOLLO_API_KEY the endpoint returns a clear 503 — the feature is wired,
 * activation is a config change.
 *
 * Imported prospects land in `accounts` with source='apollo', dedeuped by
 * (org_id, domain) — an account already synced from the CRM is never
 * overwritten (insert-or-skip, not upsert).
 */
@Injectable()
export class TamService {
  private readonly logger = new Logger(TamService.name);
  private readonly apiKey: string | undefined;

  constructor(
    @Inject(DB_TOKEN) private readonly dbHandle: DbHandle,
    private readonly scoring: ScoringService,
    config: ConfigService,
  ) {
    this.apiKey = config.get<string>('APOLLO_API_KEY');
  }

  async searchAndImport(orgId: string, criteria: TamSearchCriteria) {
    if (!this.apiKey) {
      throw new ServiceUnavailableException(
        'TAM search needs APOLLO_API_KEY (paid Apollo plan — verify current pricing first, ADR-014). ' +
          'The pipeline is ready; this is a config change, not a code change.',
      );
    }

    const limit = Math.min(criteria.limit ?? 25, 100);
    const body: Record<string, unknown> = {
      page: 1,
      per_page: limit,
    };
    if (criteria.industry) body.q_organization_keyword_tags = [criteria.industry];
    if (criteria.country) body.organization_locations = [criteria.country];
    if (criteria.employeesMin || criteria.employeesMax) {
      body.organization_num_employees_ranges = [
        `${criteria.employeesMin ?? 1},${criteria.employeesMax ?? 100000}`,
      ];
    }

    const res = await fetch('https://api.apollo.io/api/v1/mixed_companies/search', {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new ServiceUnavailableException(`Apollo search → ${res.status}`);
    }
    const data = (await res.json()) as {
      organizations?: Array<{
        name?: string;
        primary_domain?: string;
        industry?: string;
        estimated_num_employees?: number;
        country?: string;
        website_url?: string;
      }>;
    };
    const orgs = (data.organizations ?? []).filter((o) => o.primary_domain);

    let imported = 0;
    let skippedExisting = 0;
    for (const org of orgs) {
      const inserted = await this.dbHandle.db
        .insert(accounts)
        .values({
          orgId,
          domain: org.primary_domain!.toLowerCase(),
          name: org.name ?? null,
          source: 'apollo',
          enrichment: {
            industry: org.industry,
            numberofemployees: org.estimated_num_employees,
            country: org.country,
            website: org.website_url,
          },
          enrichedAt: sql`now()`,
        })
        // An account already in the list (CRM-synced or previously imported)
        // is left untouched — TAM import never clobbers CRM truth.
        .onConflictDoNothing({ target: [accounts.orgId, accounts.domain] })
        .returning({ id: accounts.id });

      if (inserted.length > 0) {
        imported += 1;
        await this.scoring.scoreAccount(orgId, inserted[0].id);
      } else {
        skippedExisting += 1;
      }
    }

    this.logger.log(`TAM import org=${orgId}: found=${orgs.length} imported=${imported} skipped=${skippedExisting}`);
    return { found: orgs.length, imported, skippedExisting };
  }

  /** TAM prospects = accounts sourced outside the CRM. */
  async listForOrg(orgId: string) {
    const rows = await this.dbHandle.db
      .select({
        id: accounts.id,
        domain: accounts.domain,
        name: accounts.name,
        enrichment: accounts.enrichment,
        fitScore: scores.fitScore,
        tier: scores.tier,
        createdAt: accounts.createdAt,
      })
      .from(accounts)
      .leftJoin(scores, and(eq(scores.accountId, accounts.id), eq(scores.orgId, accounts.orgId)))
      .where(and(eq(accounts.orgId, orgId), eq(accounts.source, 'apollo')))
      .orderBy(sql`${scores.fitScore} desc nulls last`);

    return rows.map((r) => {
      const e = (r.enrichment ?? {}) as Record<string, unknown>;
      return {
        id: r.id,
        domain: r.domain,
        name: r.name,
        industry: (e.industry as string) ?? null,
        employees: (e.numberofemployees as number) ?? null,
        country: (e.country as string) ?? null,
        fitScore: r.fitScore,
        tier: r.tier,
        createdAt: r.createdAt,
      };
    });
  }
}
