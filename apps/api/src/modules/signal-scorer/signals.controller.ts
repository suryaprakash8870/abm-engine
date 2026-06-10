import { BadRequestException, Body, Controller, Get, Post, Query } from '@nestjs/common';
import type { SignalParty } from '@abm/shared';
import { getCurrentTenant } from '../../common/tenant/tenant-context';
import {
  AWARENESS_THRESHOLDS,
  PARTY_BASE_WEIGHT,
  SignalScorerService,
  TYPE_MULTIPLIER,
} from './signal-scorer.service';

const PARTIES: SignalParty[] = ['first', 'second', 'third'];

/**
 * Signal ingestion + inspection API (Playbook Step 8).
 *
 * POST /api/signals is the single ingestion path for ALL parties — the
 * dashboard, a website tracker, or a Bombora/G2 webhook relay all post here.
 * Weights are resolved server-side from party × type (ADR-009) — callers
 * cannot inflate their own importance.
 */
@Controller('signals')
export class SignalsController {
  constructor(private readonly scorer: SignalScorerService) {}

  @Post()
  async ingest(
    @Body()
    body: {
      accountId?: string;
      domain?: string;
      type: string;
      party: SignalParty;
      source?: string;
      occurredAt?: string;
      payload?: Record<string, unknown>;
    },
  ) {
    const { orgId } = getCurrentTenant();
    if (!body?.type) throw new BadRequestException('type required (e.g. pricing_page_visit)');
    if (!PARTIES.includes(body.party)) {
      throw new BadRequestException(`party must be one of: ${PARTIES.join(', ')}`);
    }
    if (!body.accountId && !body.domain) {
      throw new BadRequestException('accountId or domain required');
    }
    return this.scorer.ingest(orgId, body);
  }

  @Get()
  async list(@Query('accountId') accountId?: string, @Query('limit') limit?: string) {
    const { orgId } = getCurrentTenant();
    if (!accountId) throw new BadRequestException('accountId query param required');
    const rows = await this.scorer.listForAccount(orgId, accountId, limit ? Number(limit) : 50);
    return { count: rows.length, signals: rows };
  }

  /** Weight + threshold config — shown in the UI so scoring is explainable. */
  @Get('config')
  config() {
    return {
      partyBaseWeight: PARTY_BASE_WEIGHT,
      typeMultiplier: TYPE_MULTIPLIER,
      awarenessThresholds: AWARENESS_THRESHOLDS,
      decayHalfLifeDays: 14,
    };
  }
}
