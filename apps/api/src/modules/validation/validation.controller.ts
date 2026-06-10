import { Controller, Get, Inject, Query } from '@nestjs/common';
import { and, eq, isNotNull } from 'drizzle-orm';
import { accounts, createDb, scores } from '@abm/db';
import type { CrmProvider } from '@abm/shared';
import { DB_TOKEN } from '../../common/db/db.module';
import { getCurrentTenant } from '../../common/tenant/tenant-context';
import { CrmAdapterFactory } from '../crm-adapter/crm-adapter.factory';

type DbHandle = ReturnType<typeof createDb>;

/** Below this many closed-won deals the correlation is statistically noise. */
const MIN_WON_DEALS_FOR_VERDICT = 5;
/** Gate criterion: engaged+ stages must close at ≥ 2× the identified rate. */
const REQUIRED_LIFT = 2;

/**
 * Phase 2 validation gate report (ADR-011, CLAUDE.md "Validation gate").
 *
 * Correlates awareness stage with closed-won outcomes pulled live from the
 * CRM. The gate CANNOT pass from code alone — it needs a real org's deal
 * history. Until enough closed-won deals exist, `gateStatus` stays
 * `pending-data` and Phase 3 rules should stay disabled.
 */
@Controller('validation')
export class ValidationController {
  constructor(
    @Inject(DB_TOKEN) private readonly dbHandle: DbHandle,
    private readonly crm: CrmAdapterFactory,
  ) {}

  @Get('awareness')
  async awarenessVsOutcomes(@Query('provider') providerParam?: CrmProvider) {
    const { orgId } = getCurrentTenant();
    const provider = providerParam ?? 'hubspot';
    const adapter = this.crm.forProvider(provider);

    // 1. Pull all deals from the CRM (paginated, capped at 2000 for safety).
    const wonAccountIds = new Set<string>();
    const lostAccountIds = new Set<string>();
    let totalDeals = 0;
    let cursor: string | undefined;
    do {
      const page = await adapter.getDeals({ cursor, limit: 100 });
      totalDeals += page.deals.length;
      for (const deal of page.deals) {
        for (const id of deal.accountExternalIds) {
          if (deal.isClosedWon) wonAccountIds.add(id);
          else if (deal.isClosedLost) lostAccountIds.add(id);
        }
      }
      cursor = page.nextCursor;
    } while (cursor && totalDeals < 2000);

    // 2. Join to our accounts + awareness stages.
    const rows = await this.dbHandle.db
      .select({
        externalCrmId: accounts.externalCrmId,
        awarenessStage: scores.awarenessStage,
      })
      .from(accounts)
      .leftJoin(scores, and(eq(scores.accountId, accounts.id), eq(scores.orgId, accounts.orgId)))
      .where(
        and(
          eq(accounts.orgId, orgId),
          eq(accounts.externalCrmProvider, provider),
          isNotNull(accounts.externalCrmId),
        ),
      );

    const STAGES = ['identified', 'aware', 'engaged', 'considering', 'selecting'] as const;
    const byStage = Object.fromEntries(
      STAGES.map((s) => [s, { stage: s, accounts: 0, won: 0, lost: 0, wonRate: 0 }]),
    ) as Record<string, { stage: string; accounts: number; won: number; lost: number; wonRate: number }>;

    let totalWonMatched = 0;
    for (const row of rows) {
      const stage = row.awarenessStage ?? 'identified';
      const bucket = byStage[stage];
      if (!bucket) continue;
      bucket.accounts += 1;
      if (row.externalCrmId && wonAccountIds.has(row.externalCrmId)) {
        bucket.won += 1;
        totalWonMatched += 1;
      }
      if (row.externalCrmId && lostAccountIds.has(row.externalCrmId)) bucket.lost += 1;
    }
    for (const bucket of Object.values(byStage)) {
      bucket.wonRate = bucket.accounts > 0 ? Math.round((bucket.won / bucket.accounts) * 1000) / 10 : 0;
    }

    // 3. Verdict.
    const identifiedRate = byStage.identified.wonRate;
    const upperStages = [byStage.engaged, byStage.considering, byStage.selecting];
    const upperAccounts = upperStages.reduce((s, b) => s + b.accounts, 0);
    const upperWon = upperStages.reduce((s, b) => s + b.won, 0);
    const upperRate = upperAccounts > 0 ? (upperWon / upperAccounts) * 100 : 0;

    let gateStatus: 'pending-data' | 'passed' | 'failed';
    let verdict: string;
    if (totalWonMatched < MIN_WON_DEALS_FOR_VERDICT) {
      gateStatus = 'pending-data';
      verdict = `Only ${totalWonMatched} closed-won deals matched to tracked accounts — need ≥ ${MIN_WON_DEALS_FOR_VERDICT} for a meaningful correlation. Connect a design partner's CRM with real deal history. Keep Phase 3 rules disabled.`;
    } else if (identifiedRate === 0 ? upperRate > 0 : upperRate >= identifiedRate * REQUIRED_LIFT) {
      gateStatus = 'passed';
      verdict = `Engaged+ stages close at ${Math.round(upperRate * 10) / 10}% vs ${identifiedRate}% baseline (≥ ${REQUIRED_LIFT}× lift). The awareness score predicts revenue — Phase 3 activation is justified. Record this in DECISIONS.md.`;
    } else {
      gateStatus = 'failed';
      verdict = `Engaged+ stages close at ${Math.round(upperRate * 10) / 10}% vs ${identifiedRate}% baseline — below the ${REQUIRED_LIFT}× criterion. Tune signal weights/thresholds (ADR-009) before enabling any orchestrator rule.`;
    }

    return {
      provider,
      dealsScanned: totalDeals,
      wonMatched: totalWonMatched,
      criterion: `engaged+considering+selecting won-rate ≥ ${REQUIRED_LIFT}× identified won-rate, with ≥ ${MIN_WON_DEALS_FOR_VERDICT} matched wins`,
      stages: STAGES.map((s) => byStage[s]),
      gateStatus,
      verdict,
    };
  }
}
