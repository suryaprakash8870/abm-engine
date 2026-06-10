import { Inject, Injectable, Logger } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { accounts, createDb } from '@abm/db';
import type { CrmProvider } from '@abm/shared';
import { DB_TOKEN } from '../../common/db/db.module';
import { CrmAdapterFactory } from '../crm-adapter/crm-adapter.factory';
import { ScoringService } from '../scoring/scoring.service';

type DbHandle = ReturnType<typeof createDb>;

/**
 * Progress contract used by both the BullMQ processor (which forwards to
 * job.updateProgress) and any future caller (cron, in-process trigger).
 *
 * The shape is deliberately UI-friendly:
 *  - `step` is a label customers can read ("Fetching from HubSpot…"),
 *     not a code identifier
 *  - `percent` covers the whole pipeline 0–100, not just within a step,
 *     so the progress bar makes one smooth pass instead of resetting
 *     at each phase
 *  - `current`/`total` let the UI show "12 of 28" alongside the bar
 *
 * See UI_FLOW.md §"Progress UX" for the customer-facing principles.
 */
export interface SyncProgress {
  step: 'fetching' | 'upserting' | 'scoring' | 'done';
  current: number;
  total: number;
  percent: number;
  message: string;
}

export type ProgressCallback = (p: SyncProgress) => Promise<void> | void;

const FETCH_BUDGET = 30; // % of total bar allocated to fetch+upsert
const SCORE_BUDGET = 70; // remaining 70% for scoring (it touches every row)

@Injectable()
export class CrmSyncService {
  private readonly logger = new Logger(CrmSyncService.name);

  constructor(
    @Inject(DB_TOKEN) private readonly dbHandle: DbHandle,
    private readonly crm: CrmAdapterFactory,
    private readonly scoring: ScoringService,
  ) {}

  async syncAccountsForOrg(
    orgId: string,
    provider: CrmProvider,
    onProgress?: ProgressCallback,
  ): Promise<{
    pages: number;
    fetched: number;
    upserted: number;
    skippedNoDomain: number;
    scored: number;
  }> {
    const adapter = this.crm.forProvider(provider);
    const db = this.dbHandle.db;

    await emit(onProgress, {
      step: 'fetching',
      current: 0,
      total: 0,
      percent: 0,
      message: 'Connecting to HubSpot…',
    });

    let cursor: string | undefined;
    let pages = 0;
    let fetched = 0;
    let upserted = 0;
    let skippedNoDomain = 0;

    do {
      const page = await adapter.getAccounts({ cursor, limit: 100 });
      pages += 1;
      fetched += page.accounts.length;

      await emit(onProgress, {
        step: 'upserting',
        current: upserted,
        total: fetched, // best estimate so far; updates with each page
        percent: Math.min(FETCH_BUDGET - 5, Math.floor((upserted / Math.max(fetched, 1)) * (FETCH_BUDGET - 5))),
        message: `Importing accounts — ${upserted} of ${fetched}`,
      });

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

    await emit(onProgress, {
      step: 'upserting',
      current: upserted,
      total: fetched,
      percent: FETCH_BUDGET,
      message: `Imported ${upserted} accounts — scoring now…`,
    });

    // Score every account. The scoring service emits sub-progress so the
    // bar continues smoothly into the scoring phase.
    const scoringResult = await this.scoring.scoreAccountsForOrg(orgId, async (s) => {
      const sliceWidth = SCORE_BUDGET;
      const within = s.total > 0 ? Math.floor((s.current / s.total) * sliceWidth) : 0;
      await emit(onProgress, {
        step: 'scoring',
        current: s.current,
        total: s.total,
        percent: FETCH_BUDGET + within,
        message: `Scoring accounts — ${s.current} of ${s.total}`,
      });
    });

    await emit(onProgress, {
      step: 'done',
      current: scoringResult.scored,
      total: scoringResult.scored,
      percent: 100,
      message: `Done — ${upserted} imported, ${scoringResult.scored} scored.`,
    });

    this.logger.log(
      `Sync done for org=${orgId} provider=${provider}: pages=${pages} fetched=${fetched} upserted=${upserted} skipped=${skippedNoDomain} scored=${scoringResult.scored}`,
    );
    return {
      pages,
      fetched,
      upserted,
      skippedNoDomain,
      scored: scoringResult.scored,
    };
  }
}

async function emit(cb: ProgressCallback | undefined, p: SyncProgress) {
  if (!cb) return;
  try {
    await cb(p);
  } catch {
    // Progress reporting is best-effort — never let a UI hiccup fail a job.
  }
}
