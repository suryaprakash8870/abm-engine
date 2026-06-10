import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { accounts, createDb } from '@abm/db';
import { DB_TOKEN } from '../../common/db/db.module';
import { RedisService } from '../../common/redis/redis.service';
import { QUEUES } from '../../common/queue/queue.constants';
import { ScoringService } from '../scoring/scoring.service';
import {
  ApolloEnrichmentProvider,
  MockEnrichmentProvider,
  type EnrichedProfile,
} from './enrichment.providers';

type DbHandle = ReturnType<typeof createDb>;

export const JOB_ENRICH_ACCOUNT = 'enrich-account';

export interface EnrichAccountJobData {
  orgId: string;
  accountId: string;
}

const CACHE_TTL_SECONDS = 7 * 24 * 3600; // 7 days, per PLAN 1B
const STALE_AFTER_DAYS = 7;

/**
 * Enrichment — component #1 of the engine. Fills firmographic gaps and adds
 * technographics on top of what the CRM sync brought in.
 *
 * Hard rule #2: never runs in a web request. `enqueueMissingForOrg` is called
 * by the sync pipeline; the BullMQ processor calls `enrichAccount`.
 *
 * Provider selection (ADR-014): Apollo when APOLLO_API_KEY is set, otherwise
 * the deterministic mock — the pipeline shape is identical either way, so
 * flipping to live enrichment is a config change, not a code change.
 *
 * Merge policy: FILL-ONLY for firmographics the CRM already provided —
 * customer CRM data always wins. Technologies are additive (union).
 */
@Injectable()
export class EnrichmentService {
  private readonly logger = new Logger(EnrichmentService.name);

  constructor(
    @Inject(DB_TOKEN) private readonly dbHandle: DbHandle,
    private readonly redis: RedisService,
    private readonly apollo: ApolloEnrichmentProvider,
    private readonly mock: MockEnrichmentProvider,
    private readonly scoring: ScoringService,
    @InjectQueue(QUEUES.ENRICHMENT) private readonly queue: Queue,
  ) {}

  private get provider() {
    return this.apollo.isLive ? this.apollo : this.mock;
  }

  /** Enqueue enrichment for every org account never enriched. Returns count. */
  async enqueueMissingForOrg(orgId: string): Promise<number> {
    const rows = await this.dbHandle.db
      .select({ id: accounts.id })
      .from(accounts)
      .where(and(eq(accounts.orgId, orgId), isNull(accounts.enrichedAt)));

    if (rows.length === 0) return 0;
    await this.queue.addBulk(
      rows.map((r) => ({
        name: JOB_ENRICH_ACCOUNT,
        data: { orgId, accountId: r.id } satisfies EnrichAccountJobData,
        opts: { jobId: `enrich-${orgId}-${r.id}` }, // dedupe per account (no ':' — BullMQ forbids it)
      })),
    );
    this.logger.log(`Enqueued ${rows.length} enrichment jobs for org=${orgId} (provider=${this.provider.name})`);
    return rows.length;
  }

  /**
   * Idempotent worker body: re-running yields the same merged result. Skips
   * accounts enriched within the staleness window so retries are cheap.
   */
  async enrichAccount(orgId: string, accountId: string): Promise<{ enriched: boolean }> {
    const [account] = await this.dbHandle.db
      .select()
      .from(accounts)
      .where(and(eq(accounts.orgId, orgId), eq(accounts.id, accountId)))
      .limit(1);
    if (!account) return { enriched: false };

    if (account.enrichedAt) {
      const ageDays = (Date.now() - account.enrichedAt.getTime()) / 86_400_000;
      if (ageDays < STALE_AFTER_DAYS) return { enriched: false };
    }

    const profile = await this.enrichDomainCached(account.domain);
    if (!profile) return { enriched: false };

    const existing = (account.enrichment ?? {}) as Record<string, unknown>;
    const existingTech = Array.isArray(existing.technologies)
      ? (existing.technologies as string[])
      : [];

    const merged: Record<string, unknown> = {
      ...existing,
      industry: existing.industry ?? profile.industry,
      numberofemployees: existing.numberofemployees ?? profile.employees,
      country: existing.country ?? profile.country,
      website: existing.website ?? profile.website,
      technologies: [...new Set([...existingTech, ...profile.technologies])],
      _enrichment: { provider: profile.provider, at: new Date().toISOString() },
    };

    await this.dbHandle.db
      .update(accounts)
      .set({ enrichment: merged, enrichedAt: sql`now()`, updatedAt: sql`now()` })
      .where(and(eq(accounts.orgId, orgId), eq(accounts.id, accountId)));

    // Re-score this account — enrichment may have filled fields the rubric
    // weights (industry/employees/country/technologies).
    await this.scoring.scoreAccount(orgId, accountId);

    return { enriched: true };
  }

  private async enrichDomainCached(domain: string): Promise<EnrichedProfile | null> {
    const cacheKey = `enrich:${this.provider.name}:${domain.toLowerCase()}`;
    try {
      const cached = await this.redis.get(cacheKey);
      if (cached) return JSON.parse(cached) as EnrichedProfile;
    } catch {
      // Cache is an optimization — never fail enrichment over it.
    }

    const profile = await this.provider.enrichDomain(domain);
    if (profile) {
      try {
        await this.redis.setex(cacheKey, CACHE_TTL_SECONDS, JSON.stringify(profile));
      } catch {
        /* best-effort */
      }
    }
    return profile;
  }
}
