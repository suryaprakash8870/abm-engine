import { BadRequestException, Body, Controller, Get, Header, Inject, Post, Query } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';
import { accounts, createDb, scores } from '@abm/db';
import { DB_TOKEN } from '../../common/db/db.module';
import { getCurrentTenant } from '../../common/tenant/tenant-context';
import { TamService, type TamSearchCriteria } from './tam.service';

type DbHandle = ReturnType<typeof createDb>;

/**
 * GTM endpoints (Playbook Steps 3 + 6).
 *
 * /tam — prospect accounts beyond the CRM (Apollo, key-gated).
 * /audiences/tiers.csv — Tier 1+2 audience export for LinkedIn / HubSpot Ads.
 *   Direct LinkedIn Ads API needs Marketing-API partner approval, so the
 *   supported path today is CSV → manual audience upload. Honest > faked.
 */
@Controller()
export class GtmController {
  constructor(
    private readonly tam: TamService,
    @Inject(DB_TOKEN) private readonly dbHandle: DbHandle,
  ) {}

  @Post('tam/search')
  async tamSearch(@Body() body: TamSearchCriteria) {
    const { orgId } = getCurrentTenant();
    return this.tam.searchAndImport(orgId, body ?? {});
  }

  @Get('tam')
  async tamList() {
    const { orgId } = getCurrentTenant();
    const rows = await this.tam.listForOrg(orgId);
    return { count: rows.length, accounts: rows };
  }

  @Get('audiences/tiers.csv')
  @Header('content-type', 'text/csv; charset=utf-8')
  @Header('content-disposition', 'attachment; filename="abm-audience-tiers.csv"')
  async audienceCsv(@Query('tiers') tiersParam?: string) {
    const { orgId } = getCurrentTenant();
    const tiers = (tiersParam ?? '1,2')
      .split(',')
      .map((t) => Number(t.trim()))
      .filter((t) => [1, 2, 3].includes(t));
    if (tiers.length === 0) throw new BadRequestException('tiers must be from 1,2,3');

    const rows = await this.dbHandle.db
      .select({
        domain: accounts.domain,
        name: accounts.name,
        tier: scores.tier,
        fitScore: scores.fitScore,
      })
      .from(scores)
      .innerJoin(accounts, eq(scores.accountId, accounts.id))
      .where(and(eq(scores.orgId, orgId), eq(accounts.orgId, orgId), inArray(scores.tier, tiers)));

    const header = 'companywebsite,companyname,tier,fit_score';
    const lines = rows.map(
      (r) => `${r.domain},${csvEscape(r.name ?? '')},${r.tier ?? ''},${r.fitScore ?? ''}`,
    );
    return [header, ...lines].join('\n');
  }
}

function csvEscape(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}
