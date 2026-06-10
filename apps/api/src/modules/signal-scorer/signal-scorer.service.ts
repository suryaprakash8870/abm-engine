import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { and, desc, eq, sql } from 'drizzle-orm';
import { accounts, createDb, scores, signals } from '@abm/db';
import type { AwarenessStage, SignalParty } from '@abm/shared';
import { DB_TOKEN } from '../../common/db/db.module';
import { QUEUES } from '../../common/queue/queue.constants';

type DbHandle = ReturnType<typeof createDb>;

export const JOB_PROCESS_SIGNAL = 'process-signal';

export interface ProcessSignalJobData {
  orgId: string;
  accountId: string;
  signalType: string;
}

// ── Weighting (ADR-009: 1st-party ≫ 2nd ≫ 3rd — NEVER equal) ─────────────

/** Base weight by party. The 10:3:1 ratio is the load-bearing decision. */
export const PARTY_BASE_WEIGHT: Record<SignalParty, number> = {
  first: 10,
  second: 3,
  third: 1,
};

/** Per-type multiplier on top of the party base. Unknown types → 1. */
export const TYPE_MULTIPLIER: Record<string, number> = {
  // 1st-party
  pricing_page_visit: 3,
  demo_request: 5,
  demo_booked: 6,
  email_reply: 4,
  content_download: 2,
  website_visit: 1,
  email_open: 0.5,
  // 2nd-party
  ad_engagement: 1,
  linkedin_engagement: 1,
  event_attendance: 2,
  warm_intro: 4,
  // 3rd-party
  hiring_signal: 1,
  funding_news: 1.5,
  tech_stack_change: 1,
  g2_intent: 1,
};

/** Exponential decay: a signal halves in influence every 14 days. */
export const DECAY_HALF_LIFE_DAYS = 14;
const LAMBDA = Math.LN2 / DECAY_HALF_LIFE_DAYS;

/** Signals older than this contribute ~nothing (>6 half-lives) — skip them. */
const MAX_SIGNAL_AGE_DAYS = 90;

// ── Awareness stages (Playbook Step 9) — explicit transition thresholds ──

export const AWARENESS_THRESHOLDS = {
  /** Signal types that mark active vendor selection. */
  selectingTypes: ['demo_booked', 'demo_request'],
  /** Signal types that mark buying consideration. */
  consideringTypes: ['pricing_page_visit'],
  /** How recent a qualifying signal must be (days). */
  recentDays: 30,
  /** Any signal within this window keeps an account at least "aware". */
  awareDays: 90,
  /** Score floors that promote a stage even without a marker signal. */
  selectingScore: 60,
  consideringScore: 30,
  engagedScore: 15,
} as const;

export function resolveWeight(party: SignalParty, type: string): number {
  return PARTY_BASE_WEIGHT[party] * (TYPE_MULTIPLIER[type] ?? 1);
}

export interface IngestSignalInput {
  accountId?: string;
  domain?: string;
  type: string;
  party: SignalParty;
  source?: string;
  occurredAt?: string;
  payload?: Record<string, unknown>;
}

/**
 * Signal Scorer (component 3/5) — ingest weighted signals, decay old ones,
 * output a rolling score + awareness stage per account.
 *
 * Ingestion is a fast insert (OK in-request); the recompute + orchestrator
 * evaluation happen on the SIGNAL_INGEST queue (hard rule #2).
 */
@Injectable()
export class SignalScorerService {
  private readonly logger = new Logger(SignalScorerService.name);

  constructor(
    @Inject(DB_TOKEN) private readonly dbHandle: DbHandle,
    @InjectQueue(QUEUES.SIGNAL_INGEST) private readonly queue: Queue,
  ) {}

  /** Insert the signal (server-side weight) and queue the recompute. */
  async ingest(orgId: string, input: IngestSignalInput) {
    const db = this.dbHandle.db;

    let accountId = input.accountId;
    if (!accountId && input.domain) {
      const [acc] = await db
        .select({ id: accounts.id })
        .from(accounts)
        .where(and(eq(accounts.orgId, orgId), eq(accounts.domain, input.domain.toLowerCase())))
        .limit(1);
      accountId = acc?.id;
    }
    if (!accountId) {
      throw new NotFoundException(
        'Account not found — pass a known accountId or a domain already in your account list',
      );
    }

    const weight = resolveWeight(input.party, input.type);
    const [row] = await db
      .insert(signals)
      .values({
        orgId,
        accountId,
        type: input.type,
        party: input.party,
        source: input.source ?? null,
        weight,
        payload: input.payload ?? null,
        occurredAt: input.occurredAt ? new Date(input.occurredAt) : new Date(),
      })
      .returning({ id: signals.id });

    await this.queue.add(
      JOB_PROCESS_SIGNAL,
      { orgId, accountId, signalType: input.type } satisfies ProcessSignalJobData,
      // Coalesce a burst of signals for one account into one recompute.
      // (Dashes, not colons — BullMQ rejects ':' in custom job IDs.)
      { jobId: `signal-${orgId}-${accountId}-${Date.now() >> 13}` },
    );

    return { signalId: row.id, accountId, weight, queued: true };
  }

  /** List recent signals for an account (timeline UI). */
  async listForAccount(orgId: string, accountId: string, limit = 50) {
    return this.dbHandle.db
      .select()
      .from(signals)
      .where(and(eq(signals.orgId, orgId), eq(signals.accountId, accountId)))
      .orderBy(desc(signals.occurredAt))
      .limit(Math.min(limit, 200));
  }

  /**
   * Recompute the rolling signal score + awareness stage for one account.
   * Idempotent — same signals always produce the same score/stage.
   */
  async recomputeForAccount(
    orgId: string,
    accountId: string,
  ): Promise<{ signalScore: number; stage: AwarenessStage; stageChanged: boolean }> {
    const db = this.dbHandle.db;
    const now = Date.now();

    const rows = await db
      .select({
        type: signals.type,
        party: signals.party,
        weight: signals.weight,
        occurredAt: signals.occurredAt,
      })
      .from(signals)
      .where(and(eq(signals.orgId, orgId), eq(signals.accountId, accountId)))
      .orderBy(desc(signals.occurredAt))
      .limit(1000);

    let score = 0;
    for (const s of rows) {
      const ageDays = (now - s.occurredAt.getTime()) / 86_400_000;
      if (ageDays < 0 || ageDays > MAX_SIGNAL_AGE_DAYS) continue;
      score += s.weight * Math.exp(-LAMBDA * ageDays);
    }
    const signalScore = Math.round(score * 10) / 10;

    const stage = computeStage(signalScore, rows, now);

    const [existing] = await db
      .select({ awarenessStage: scores.awarenessStage, stageHistory: scores.stageHistory })
      .from(scores)
      .where(and(eq(scores.orgId, orgId), eq(scores.accountId, accountId)))
      .limit(1);

    const stageChanged = existing?.awarenessStage !== stage;
    const history = stageChanged
      ? [...(existing?.stageHistory ?? []), { stage, at: new Date().toISOString() }]
      : (existing?.stageHistory ?? null);

    await db
      .insert(scores)
      .values({
        orgId,
        accountId,
        signalScore,
        awarenessStage: stage,
        stageHistory: history,
        computedAt: sql`now()`,
      })
      .onConflictDoUpdate({
        target: [scores.orgId, scores.accountId],
        set: {
          signalScore,
          awarenessStage: stage,
          ...(history ? { stageHistory: history } : {}),
          computedAt: sql`now()`,
        },
      });

    if (stageChanged) {
      this.logger.log(
        `Account ${accountId} (org=${orgId}) moved to awareness stage "${stage}" (signal score ${signalScore})`,
      );
    }
    return { signalScore, stage, stageChanged };
  }

  /** Kept for backward compatibility with the Phase 0 stub signature. */
  async computeSignalScore(accountId: string): Promise<number> {
    this.logger.warn(
      `computeSignalScore(${accountId}) called without orgId — use recomputeForAccount(orgId, accountId)`,
    );
    return 0;
  }
}

function computeStage(
  signalScore: number,
  rows: Array<{ type: string; party: string; occurredAt: Date }>,
  now: number,
): AwarenessStage {
  const T = AWARENESS_THRESHOLDS;
  const withinDays = (d: Date, days: number) => now - d.getTime() <= days * 86_400_000;

  const recentTypes = new Set(
    rows.filter((r) => withinDays(r.occurredAt, T.recentDays)).map((r) => r.type),
  );
  const hasRecentFirstParty = rows.some(
    (r) => r.party === 'first' && withinDays(r.occurredAt, T.recentDays),
  );
  const hasAnyWithinAware = rows.some((r) => withinDays(r.occurredAt, T.awareDays));

  if (T.selectingTypes.some((t) => recentTypes.has(t)) || signalScore >= T.selectingScore) {
    return 'selecting';
  }
  if (T.consideringTypes.some((t) => recentTypes.has(t)) || signalScore >= T.consideringScore) {
    return 'considering';
  }
  if (hasRecentFirstParty || signalScore >= T.engagedScore) {
    return 'engaged';
  }
  if (hasAnyWithinAware) {
    return 'aware';
  }
  return 'identified';
}
