import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { accounts, contacts, createDb, scores } from '@abm/db';
import { DB_TOKEN } from '../../common/db/db.module';
import { getCurrentTenant } from '../../common/tenant/tenant-context';
import { ScoringService } from '../scoring/scoring.service';

type DbHandle = ReturnType<typeof createDb>;

/**
 * Application-layer org_id filtering. We still SELECT with `where org_id = X`
 * even though Drizzle's superuser connection bypasses RLS — defense in depth.
 * When we swap to the `abm_app` role for runtime, the RLS policies will catch
 * any missed filter as a backstop.
 *
 * Default sort: tier ASC NULLS LAST, then fit_score DESC. Per UI_FLOW's
 * "lead with the action" principle — T1 accounts surface first.
 */
@Injectable()
export class AccountsService {
  constructor(
    @Inject(DB_TOKEN) private readonly dbHandle: DbHandle,
    private readonly scoring: ScoringService,
  ) {}

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
        fitScore: scores.fitScore,
        tier: scores.tier,
        signalScore: scores.signalScore,
        awarenessStage: scores.awarenessStage,
        scoreComputedAt: scores.computedAt,
        source: accounts.source,
      })
      .from(accounts)
      .leftJoin(
        scores,
        and(eq(scores.accountId, accounts.id), eq(scores.orgId, accounts.orgId)),
      )
      .where(eq(accounts.orgId, orgId))
      .orderBy(
        sql`${scores.tier} asc nulls last`,
        desc(scores.fitScore),
        asc(accounts.domain),
      )
      .limit(limit);

    return rows.map((r) => ({
      id: r.id,
      domain: r.domain,
      name: r.name,
      externalCrmId: r.externalCrmId,
      externalCrmProvider: r.externalCrmProvider,
      industry: pickProp(r.enrichment, 'industry'),
      employees: pickProp(r.enrichment, 'numberofemployees'),
      country: pickProp(r.enrichment, 'country'),
      website: pickProp(r.enrichment, 'website'),
      fitScore: r.fitScore,
      tier: r.tier,
      signalScore: r.signalScore,
      awarenessStage: r.awarenessStage,
      source: r.source,
      scoreComputedAt: r.scoreComputedAt,
      enrichedAt: r.enrichedAt,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  }

  /**
   * Fetch one account with its score + breakdown for the detail page.
   * Breakdown is computed on-demand against the current rubric — it always
   * reflects the live rules, so editing the rubric instantly changes what
   * users see without a backfill job.
   *
   * Per UI_FLOW.md principle #2: "Always explain the score. Never show a
   * bare 82." This endpoint is the data behind that principle.
   */
  async getOneForCurrentOrg(accountId: string) {
    const { orgId } = getCurrentTenant();

    const [row] = await this.dbHandle.db
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
        fitScore: scores.fitScore,
        tier: scores.tier,
        signalScore: scores.signalScore,
        awarenessStage: scores.awarenessStage,
        scoreComputedAt: scores.computedAt,
      })
      .from(accounts)
      .leftJoin(
        scores,
        and(eq(scores.accountId, accounts.id), eq(scores.orgId, accounts.orgId)),
      )
      .where(and(eq(accounts.orgId, orgId), eq(accounts.id, accountId)))
      .limit(1);

    if (!row) {
      throw new NotFoundException(`Account ${accountId} not found in this org`);
    }

    // explainAccount returns null if no rubric is configured — the rest of the
    // detail page still works without a breakdown, so we tolerate it.
    const explanation = await this.scoring.explainAccount(orgId, accountId);

    return {
      account: {
        id: row.id,
        domain: row.domain,
        name: row.name,
        externalCrmId: row.externalCrmId,
        externalCrmProvider: row.externalCrmProvider,
        industry: pickProp(row.enrichment, 'industry'),
        employees: pickProp(row.enrichment, 'numberofemployees'),
        country: pickProp(row.enrichment, 'country'),
        website: pickProp(row.enrichment, 'website'),
        enrichment: row.enrichment as Record<string, unknown> | null,
        enrichedAt: row.enrichedAt,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      },
      score: {
        fitScore: row.fitScore,
        tier: row.tier,
        signalScore: row.signalScore,
        awarenessStage: row.awarenessStage,
        computedAt: row.scoreComputedAt,
      },
      breakdown: explanation?.breakdown ?? null,
      // The total computed live from the breakdown may differ from the
      // persisted fitScore if the rubric was changed after the last sync.
      // Surface both so the UI can show a "stale" hint if needed.
      liveFitScore: explanation?.fitScore ?? null,
      liveTier: explanation?.tier ?? null,
    };
  }

  /**
   * Aggregate stats for the landing page: total accounts, tier breakdown,
   * last scoring run, average fit score. One query, no row data — cheap.
   */
  async summaryForCurrentOrg(): Promise<{
    total: number;
    tierCounts: { tier1: number; tier2: number; tier3: number; unscored: number };
    awarenessCounts: Record<string, number>;
    lastScoredAt: string | null;
    avgFitScore: number | null;
  }> {
    const { orgId } = getCurrentTenant();

    const [row] = await this.dbHandle.db
      .select({
        total: sql<number>`count(${accounts.id})::int`,
        tier1: sql<number>`count(${scores.tier}) filter (where ${scores.tier} = 1)::int`,
        tier2: sql<number>`count(${scores.tier}) filter (where ${scores.tier} = 2)::int`,
        tier3: sql<number>`count(${scores.tier}) filter (where ${scores.tier} = 3)::int`,
        unscored: sql<number>`count(${accounts.id}) filter (where ${scores.fitScore} is null)::int`,
        identified: sql<number>`count(${accounts.id}) filter (where ${scores.awarenessStage} = 'identified' or ${scores.awarenessStage} is null)::int`,
        aware: sql<number>`count(${accounts.id}) filter (where ${scores.awarenessStage} = 'aware')::int`,
        engaged: sql<number>`count(${accounts.id}) filter (where ${scores.awarenessStage} = 'engaged')::int`,
        considering: sql<number>`count(${accounts.id}) filter (where ${scores.awarenessStage} = 'considering')::int`,
        selecting: sql<number>`count(${accounts.id}) filter (where ${scores.awarenessStage} = 'selecting')::int`,
        lastScoredAt: sql<string | null>`max(${scores.computedAt})::text`,
        avgFitScore: sql<number | null>`avg(${scores.fitScore})::float`,
      })
      .from(accounts)
      .leftJoin(
        scores,
        and(eq(scores.accountId, accounts.id), eq(scores.orgId, accounts.orgId)),
      )
      .where(eq(accounts.orgId, orgId));

    return {
      total: row?.total ?? 0,
      tierCounts: {
        tier1: row?.tier1 ?? 0,
        tier2: row?.tier2 ?? 0,
        tier3: row?.tier3 ?? 0,
        unscored: row?.unscored ?? 0,
      },
      awarenessCounts: {
        identified: row?.identified ?? 0,
        aware: row?.aware ?? 0,
        engaged: row?.engaged ?? 0,
        considering: row?.considering ?? 0,
        selecting: row?.selecting ?? 0,
      },
      lastScoredAt: row?.lastScoredAt ?? null,
      avgFitScore:
        row?.avgFitScore !== undefined && row?.avgFitScore !== null
          ? Math.round(row.avgFitScore)
          : null,
    };
  }

  /** Contacts for one account, decision-makers first (Playbook Step 7). */
  async contactsForAccount(accountId: string) {
    const { orgId } = getCurrentTenant();
    return this.dbHandle.db
      .select()
      .from(contacts)
      .where(and(eq(contacts.orgId, orgId), eq(contacts.accountId, accountId)))
      .orderBy(
        sql`case ${contacts.role} when 'decision_maker' then 0 when 'champion' then 1 when 'influencer' then 2 else 3 end`,
        asc(contacts.email),
      );
  }
}

function pickProp(enrichment: unknown, key: string): string | null {
  if (!enrichment || typeof enrichment !== 'object') return null;
  const value = (enrichment as Record<string, unknown>)[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}
