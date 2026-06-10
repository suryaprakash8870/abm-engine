import { Controller, Get, Param, Query } from '@nestjs/common';
import { AccountsService } from './accounts.service';

@Controller('accounts')
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}

  /**
   * GET /api/accounts — tenant-scoped via TenantMiddleware (x-org-id header
   * in Phase 1, Supabase JWT later). Returns the org's accounts with the
   * most-used firmographic fields surfaced from the enrichment JSON.
   */
  @Get()
  async list(@Query('search') search?: string, @Query('limit') limit?: string) {
    const rows = await this.accounts.listForCurrentOrg({
      search,
      limit: limit ? Number(limit) : undefined,
    });
    return { count: rows.length, accounts: rows };
  }

  /** Lightweight aggregate stats for the landing page. */
  @Get('summary')
  async summary() {
    return this.accounts.summaryForCurrentOrg();
  }

  /**
   * Account detail with full score breakdown. Powers /accounts/[id].
   * The breakdown is recomputed on every request — cheap (deterministic
   * arithmetic) and guarantees it always matches the current rubric.
   *
   * Route order matters in Nest's path matcher: this MUST come after
   * 'summary' so /api/accounts/summary doesn't fall into this handler.
   */
  @Get(':id')
  async byId(@Param('id') id: string) {
    return this.accounts.getOneForCurrentOrg(id);
  }
}
