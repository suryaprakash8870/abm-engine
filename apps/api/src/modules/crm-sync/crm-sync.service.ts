import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, eq, isNotNull, sql } from 'drizzle-orm';
import { accounts, contacts, createDb, scores } from '@abm/db';
import type { ContactRole, CrmAdapter, CrmProvider } from '@abm/shared';
import { DB_TOKEN } from '../../common/db/db.module';
import { CrmAdapterFactory } from '../crm-adapter/crm-adapter.factory';
import { EnrichmentService } from '../enrichment/enrichment.service';
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
  step: 'fetching' | 'upserting' | 'scoring' | 'writing-back' | 'done';
  current: number;
  total: number;
  percent: number;
  message: string;
}

export type ProgressCallback = (p: SyncProgress) => Promise<void> | void;

const FETCH_BUDGET = 30; // % of total bar allocated to fetch+upsert
const SCORE_BUDGET = 40; // scoring touches every row but is local arithmetic
const WRITEBACK_BUDGET = 30; // one CRM PATCH per scored account — the slow tail

/**
 * Write-back field definitions (Playbook Steps 5 + 11). Only abm_* fields are
 * ever written — never a customer's own fields (ADR-010).
 */
const SCORE_PROPERTY_DEFS = [
  { object: 'account', name: 'abm_tier', label: 'ABM Tier', type: 'number' },
  { object: 'account', name: 'abm_fit_score', label: 'ABM Fit Score', type: 'number' },
  { object: 'account', name: 'abm_signal_score', label: 'ABM Signal Score', type: 'number' },
  { object: 'account', name: 'abm_awareness_stage', label: 'ABM Awareness Stage', type: 'string' },
] as const;

const CONTACT_PROPERTY_DEFS = [
  { object: 'contact', name: 'abm_role', label: 'ABM Buying Role', type: 'string' },
] as const;

@Injectable()
export class CrmSyncService {
  private readonly logger = new Logger(CrmSyncService.name);

  constructor(
    @Inject(DB_TOKEN) private readonly dbHandle: DbHandle,
    private readonly crm: CrmAdapterFactory,
    private readonly scoring: ScoringService,
    private readonly enrichment: EnrichmentService,
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
    writtenBack: number;
    writeBackFailed: number;
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

    // Queue background enrichment for accounts never enriched (hard rule #2:
    // enrichment NEVER runs inline — these are separate BullMQ jobs).
    const enrichQueued = await this.enrichment.enqueueMissingForOrg(orgId);
    if (enrichQueued > 0) {
      this.logger.log(`Queued ${enrichQueued} enrichment jobs for org=${orgId}`);
    }

    // Push tier + fit score back to the CRM as abm_* custom properties
    // (Playbook Step 5). Runs inside the same BullMQ job — never in a request.
    const writeBack = await this.writeBackScores(orgId, provider, adapter, onProgress);

    await emit(onProgress, {
      step: 'done',
      current: scoringResult.scored,
      total: scoringResult.scored,
      percent: 100,
      message: `Done — ${upserted} imported, ${scoringResult.scored} scored, ${writeBack.writtenBack} written back.`,
    });

    this.logger.log(
      `Sync done for org=${orgId} provider=${provider}: pages=${pages} fetched=${fetched} upserted=${upserted} skipped=${skippedNoDomain} scored=${scoringResult.scored} writtenBack=${writeBack.writtenBack} writeBackFailed=${writeBack.writeBackFailed}`,
    );
    return {
      pages,
      fetched,
      upserted,
      skippedNoDomain,
      scored: scoringResult.scored,
      ...writeBack,
    };
  }

  /**
   * Write each scored account's tier + fit score back to its CRM record.
   *
   * Scope: only accounts that came FROM this provider (have an externalCrmId)
   * — seeded/synthetic accounts are skipped naturally. Per-row failures are
   * counted, logged, and never abort the batch: write-back is enrichment,
   * not a transaction (re-running the sync retries them — PATCH is idempotent).
   */
  private async writeBackScores(
    orgId: string,
    provider: CrmProvider,
    adapter: CrmAdapter,
    onProgress?: ProgressCallback,
  ): Promise<{ writtenBack: number; writeBackFailed: number }> {
    const rows = await this.dbHandle.db
      .select({
        externalCrmId: accounts.externalCrmId,
        domain: accounts.domain,
        fitScore: scores.fitScore,
        tier: scores.tier,
        signalScore: scores.signalScore,
        awarenessStage: scores.awarenessStage,
      })
      .from(scores)
      .innerJoin(accounts, eq(scores.accountId, accounts.id))
      .where(
        and(
          eq(scores.orgId, orgId),
          eq(accounts.orgId, orgId),
          eq(accounts.externalCrmProvider, provider),
          isNotNull(accounts.externalCrmId),
        ),
      );

    if (rows.length === 0) return { writtenBack: 0, writeBackFailed: 0 };

    // Write-back is enrichment, not a transaction — if we can't even create
    // our abm_* property definitions (typically a missing scope on the
    // HubSpot key), skip write-back for this run instead of failing the
    // whole sync. Accounts, scores, and enrichment still land.
    try {
      await adapter.ensureCustomProperties([...SCORE_PROPERTY_DEFS]);
    } catch (err) {
      this.logger.warn(
        `Skipping CRM write-back this run — cannot ensure abm_* properties on ${provider}: ${(err as Error).message}` +
          (provider === 'hubspot'
            ? ' → grant the Service Key the "crm.schemas.companies.write" scope (HubSpot → Settings → Integrations → Private Apps → Scopes), then re-sync.'
            : ''),
      );
      return { writtenBack: 0, writeBackFailed: rows.length };
    }

    let writtenBack = 0;
    let writeBackFailed = 0;
    for (const row of rows) {
      try {
        await adapter.upsertAccount({
          matchKey: { externalId: row.externalCrmId! },
          properties: {
            // Empty string clears OUR field in HubSpot when a rubric change
            // drops the tier — a stale tier is worse than a blank one.
            abm_tier: row.tier ?? '',
            abm_fit_score: row.fitScore,
            abm_signal_score: row.signalScore,
            abm_awareness_stage: row.awarenessStage ?? '',
          },
        });
        writtenBack += 1;
      } catch (err) {
        writeBackFailed += 1;
        this.logger.warn(
          `Write-back failed for ${row.domain} (${provider} ${row.externalCrmId}): ${(err as Error).message}`,
        );
      }
      await emit(onProgress, {
        step: 'writing-back',
        current: writtenBack + writeBackFailed,
        total: rows.length,
        percent:
          FETCH_BUDGET +
          SCORE_BUDGET +
          Math.floor(((writtenBack + writeBackFailed) / rows.length) * WRITEBACK_BUDGET),
        message: `Writing scores to CRM — ${writtenBack + writeBackFailed} of ${rows.length}`,
      });
    }

    return { writtenBack, writeBackFailed };
  }

  /**
   * Contacts sync (Playbook Step 7) — for every CRM-sourced account, pull its
   * contacts, classify the buying role from the job title, store them, and
   * write `abm_role` back to the CRM contact.
   *
   * Idempotent: upserts on (org_id, email); contacts without an email are
   * skipped (no stable dedupe key — by design, hard rule #7 matches on
   * email/phone).
   */
  async syncContactsForOrg(
    orgId: string,
    provider: CrmProvider,
  ): Promise<{ accounts: number; contacts: number; skippedNoEmail: number; roleWriteBackFailed: number }> {
    const adapter = this.crm.forProvider(provider);
    const db = this.dbHandle.db;

    const orgAccounts = await db
      .select({ id: accounts.id, externalCrmId: accounts.externalCrmId })
      .from(accounts)
      .where(
        and(
          eq(accounts.orgId, orgId),
          eq(accounts.externalCrmProvider, provider),
          isNotNull(accounts.externalCrmId),
        ),
      );

    let upserted = 0;
    let skippedNoEmail = 0;
    let roleWriteBackFailed = 0;
    let rolePropertyEnsured = false;
    // One ensure failure (e.g. missing schema scope) disables role write-back
    // for the rest of the run — avoids one warning per contact.
    let roleWriteBackDisabled = false;

    for (const account of orgAccounts) {
      let cursor: string | undefined;
      do {
        const page = await adapter.getContacts({
          accountId: account.externalCrmId!,
          cursor,
          limit: 100,
        });

        for (const c of page.contacts) {
          if (!c.email) {
            skippedNoEmail += 1;
            continue;
          }
          const role = classifyRole(c.title);

          await db
            .insert(contacts)
            .values({
              orgId,
              accountId: account.id,
              email: c.email.toLowerCase(),
              phone: c.phone ?? null,
              firstName: c.firstName ?? null,
              lastName: c.lastName ?? null,
              title: c.title ?? null,
              role,
              externalCrmId: c.externalId,
              externalCrmProvider: provider,
            })
            .onConflictDoUpdate({
              target: [contacts.orgId, contacts.email],
              set: {
                accountId: account.id,
                phone: c.phone ?? null,
                firstName: c.firstName ?? null,
                lastName: c.lastName ?? null,
                title: c.title ?? null,
                role,
                externalCrmId: c.externalId,
                externalCrmProvider: provider,
                updatedAt: sql`now()`,
              },
            });
          upserted += 1;

          // Role write-back (Playbook Step 7: "upload to CRM with custom
          // properties … stakeholder role"). Only our abm_role field.
          if (!roleWriteBackDisabled) {
            try {
              if (!rolePropertyEnsured) {
                await adapter.ensureCustomProperties([...CONTACT_PROPERTY_DEFS]);
                rolePropertyEnsured = true;
              }
              await adapter.upsertContact({
                matchKey: { externalId: c.externalId },
                properties: { abm_role: role },
              });
            } catch (err) {
              roleWriteBackFailed += 1;
              if (!rolePropertyEnsured) {
                roleWriteBackDisabled = true;
                this.logger.warn(
                  `Disabling abm_role write-back this run — cannot ensure the property: ${(err as Error).message}` +
                    (provider === 'hubspot'
                      ? ' → grant the Service Key the "crm.schemas.contacts.write" scope, then re-sync.'
                      : ''),
                );
              } else {
                this.logger.warn(
                  `abm_role write-back failed for ${c.email}: ${(err as Error).message}`,
                );
              }
            }
          }
        }
        cursor = page.nextCursor;
      } while (cursor);
    }

    this.logger.log(
      `Contacts sync done for org=${orgId}: accounts=${orgAccounts.length} contacts=${upserted} skippedNoEmail=${skippedNoEmail} roleWbFailed=${roleWriteBackFailed}`,
    );
    return {
      accounts: orgAccounts.length,
      contacts: upserted,
      skippedNoEmail,
      roleWriteBackFailed,
    };
  }
}

/**
 * Title → buying role heuristic (Playbook Step 7). Regex now; AI
 * classification is a Phase 4 upgrade if titles prove too messy.
 */
export function classifyRole(title: string | null | undefined): ContactRole {
  if (!title || title.trim().length === 0) return 'unknown';
  const t = title.toLowerCase();
  if (
    /\b(ceo|cfo|cto|coo|cmo|cro|cio|chief|founder|co-?founder|owner|president|vp|vice president|head of|director)\b/.test(t)
  ) {
    return 'decision_maker';
  }
  if (/\b(manager|lead|principal|senior|architect)\b/.test(t)) {
    return 'champion';
  }
  return 'influencer';
}

async function emit(cb: ProgressCallback | undefined, p: SyncProgress) {
  if (!cb) return;
  try {
    await cb(p);
  } catch {
    // Progress reporting is best-effort — never let a UI hiccup fail a job.
  }
}
