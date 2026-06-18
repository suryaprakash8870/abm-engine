/**
 * Core service for the Awareness Engine (engine 08).
 *
 * Deterministic, auditable scoring (NO LLM): recompute a time-decayed, capped
 * awareness score from an account's signal history, map it to the 5-stage funnel,
 * detect "hot" jumps, evaluate routing rules, and snapshot the daily score.
 *
 * Owned tables: awareness_scores, score_snapshots, routing_rules,
 * routing_rule_evaluations, stage_change_log.
 *
 * NOTE (cross-engine read): the decayed score is recomputed from the Signal Engine's
 * `signals` table — the established MVP pattern (ADR-013, deferred local-copy refactor).
 * Reading the full history (rather than incrementing) keeps the score exact + auditable.
 */

import { prisma } from '../../db/client';
import { Prisma } from '@prisma/client';
import type { AwarenessStage, Json, SignalReceivedPayload, AccountStageChangedPayload } from '../../events';

// ── Stage ladder ─────────────────────────────────────────────────────────────

export const STAGE_ORDER: AwarenessStage[] = ['identified', 'aware', 'interested', 'considering', 'selecting'];
const STAGE_THRESHOLDS: Array<{ stage: AwarenessStage; min: number }> = [
  { stage: 'selecting', min: 80 },
  { stage: 'considering', min: 60 },
  { stage: 'interested', min: 40 },
  { stage: 'aware', min: 20 },
  { stage: 'identified', min: 0 },
];

/** Map a 0-100 score to its awareness stage. */
export function stageForScore(score: number): AwarenessStage {
  for (const t of STAGE_THRESHOLDS) if (score >= t.min) return t.stage;
  return 'identified';
}

/** Pure decay factor: a signal keeps `(1-decay)^weeks` of its points. Clamped + NaN-safe. */
export function decayFactor(decayPerWeek: number, ageWeeks: number): number {
  const d = Number.isFinite(decayPerWeek) ? Math.min(0.9999, Math.max(0, decayPerWeek)) : 0.5;
  return Math.pow(1 - d, Math.max(0, ageWeeks));
}

// ── Decayed score from the signal history ────────────────────────────────────

export interface DecayedResult {
  score: number; // capped at 100
  dominantSignalType: string;
  lastSignalAt: string | null;
  topSignals: Array<{ signal_type: string; points_awarded: number; current_value: number; occurred_at: string }>;
}

export async function decayedScoreForAccount(workspaceId: string, accountId: string, asOf: Date = new Date()): Promise<DecayedResult> {
  const signals = await prisma.signal.findMany({
    where: { workspaceId, accountId },
    select: { signalType: true, pointsAwarded: true, decayRatePerWeek: true, occurredAt: true },
    orderBy: { occurredAt: 'desc' },
  });
  const now = asOf.getTime();
  let total = 0;
  const byType = new Map<string, number>();
  const valued = signals.map((s) => {
    const ageWeeks = (now - s.occurredAt.getTime()) / (7 * 24 * 3600 * 1000);
    const v = s.pointsAwarded * decayFactor(s.decayRatePerWeek, ageWeeks);
    total += v;
    byType.set(s.signalType, (byType.get(s.signalType) ?? 0) + v);
    return { s, v };
  });
  const score = Math.min(100, Math.round(total));
  const dominantSignalType = [...byType.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'none';
  return {
    score,
    dominantSignalType,
    lastSignalAt: signals[0]?.occurredAt.toISOString() ?? null,
    topSignals: valued.slice(0, 3).map(({ s, v }) => ({
      signal_type: s.signalType, points_awarded: s.pointsAwarded, current_value: Math.round(v * 10) / 10, occurred_at: s.occurredAt.toISOString(),
    })),
  };
}

/** Score N days ago from the snapshot history (for 7d/30d deltas). */
async function scoreDaysAgo(workspaceId: string, accountId: string, days: number, asOf: Date): Promise<number> {
  const cutoff = new Date(asOf.getTime() - days * 24 * 3600 * 1000);
  const snap = await prisma.scoreSnapshot.findFirst({
    where: { workspaceId, accountId, date: { lte: cutoff } },
    orderBy: { date: 'desc' },
    select: { score: true },
  });
  return snap?.score ?? 0;
}

// ── Full recompute for one account (the handler's core) ──────────────────────

export interface ProcessResult {
  scoreUpdated: import('../../events').AccountScoreUpdatedPayload;
  stageChanged: import('../../events').AccountStageChangedPayload | null;
  hot: import('../../events').AccountHotPayload | null;
  matchedRuleCount: number;
}

const HOT_JUMP = 20; // points within the 48h window
const HOT_WINDOW_HOURS = 48;

export async function processSignal(
  workspaceId: string,
  accountId: string,
  newSignal: SignalReceivedPayload,
  asOf: Date = new Date(),
): Promise<ProcessResult> {
  const prev = await prisma.awarenessScore.findUnique({ where: { workspaceId_accountId: { workspaceId, accountId } } });
  const prevScore = prev?.currentScore ?? 0;
  const prevStage = (prev?.stage as AwarenessStage) ?? 'identified';

  const decayed = await decayedScoreForAccount(workspaceId, accountId, asOf);
  const stage = stageForScore(decayed.score);
  const stageChanged = stage !== prevStage;
  // Hot = a >20pt jump WITHIN the 48h window — measured against the score ~48h ago
  // (from snapshots), not merely since the last signal, so window_hours is real and
  // a retry (which leaves the score unchanged) can't re-fire it.
  const score48hAgo = await scoreDaysAgo(workspaceId, accountId, 2, asOf);
  const scoreChange = decayed.score - score48hAgo;
  const isHot = scoreChange > HOT_JUMP;

  const lastSignalAt = decayed.lastSignalAt ?? newSignal.occurred_at;
  const score7dChange = decayed.score - (await scoreDaysAgo(workspaceId, accountId, 7, asOf));
  const score30dChange = decayed.score - (await scoreDaysAgo(workspaceId, accountId, 30, asOf));
  const nowIso = asOf.toISOString();
  const today = nowIso.slice(0, 10);

  // Persist score + stage transition + daily snapshot atomically.
  await prisma.$transaction(async (tx) => {
    await tx.awarenessScore.upsert({
      where: { workspaceId_accountId: { workspaceId, accountId } },
      create: { workspaceId, accountId, currentScore: decayed.score, stage, score7dChange, score30dChange, lastCalculatedAt: asOf, lastSignalAt: new Date(lastSignalAt) },
      update: { currentScore: decayed.score, stage, score7dChange, score30dChange, lastCalculatedAt: asOf, lastSignalAt: new Date(lastSignalAt) },
    });
    if (stageChanged) {
      await tx.stageChangeLog.create({ data: { workspaceId, accountId, fromStage: prevStage, toStage: stage, score: decayed.score, changedAt: asOf } });
    }
    await tx.scoreSnapshot.upsert({
      where: { workspaceId_accountId_date: { workspaceId, accountId, date: new Date(today) } },
      create: { workspaceId, accountId, date: new Date(today), score: decayed.score, dominantSignalType: decayed.dominantSignalType },
      update: { score: decayed.score, dominantSignalType: decayed.dominantSignalType },
    });
  });

  // Evaluate routing rules against the updated score (records evaluations; matched
  // rules are escalated to the Orchestrator via the published events below).
  const matchedRuleCount = await evaluateRoutingRules(workspaceId, accountId, decayed.score, stage, decayed.dominantSignalType, asOf);

  return {
    scoreUpdated: {
      account_id: accountId,
      current_score: decayed.score,
      previous_score: prevScore,
      stage,
      score_7d_change: score7dChange,
      score_30d_change: score30dChange,
      last_signal_at: lastSignalAt,
      last_calculated_at: nowIso,
    },
    stageChanged: stageChanged
      ? { account_id: accountId, from_stage: prevStage, to_stage: stage, score: decayed.score, changed_at: nowIso }
      : null,
    hot: isHot
      ? {
          account_id: accountId, current_score: decayed.score, score_change: scoreChange, window_hours: HOT_WINDOW_HOURS,
          stage, dominant_signal_type: decayed.dominantSignalType, top_recent_signals: decayed.topSignals as unknown as Json[],
        }
      : null,
    matchedRuleCount,
  };
}

// ── Routing rules ────────────────────────────────────────────────────────────

interface TriggerConfig { min_score?: number; stage?: AwarenessStage; signal_types?: string[] }

/** Evaluate active rules against the score; honour cooldown_days + max_per_month. Returns #matched. */
export async function evaluateRoutingRules(
  workspaceId: string,
  accountId: string,
  score: number,
  stage: AwarenessStage,
  dominantSignalType: string,
  asOf: Date = new Date(),
): Promise<number> {
  const rules = await prisma.routingRule.findMany({ where: { workspaceId, isActive: true }, orderBy: { priority: 'desc' } });
  let matched = 0;
  for (const rule of rules) {
    const cfg = (rule.triggerConfig ?? {}) as TriggerConfig;
    const isMatch =
      (cfg.min_score === undefined || score >= cfg.min_score) &&
      (cfg.stage === undefined || cfg.stage === stage) &&
      (cfg.signal_types === undefined || cfg.signal_types.includes(dominantSignalType));

    if (!isMatch) continue; // only matched rules get an eval row (non-matches would grow unbounded)
    matched += 1;

    // Cooldown: don't re-fire for this account until STRICTLY past cooldown_days (gt, not gte).
    const cooldownCutoff = new Date(asOf.getTime() - rule.cooldownDays * 24 * 3600 * 1000);
    const recentFire = await prisma.routingRuleEvaluation.findFirst({
      where: { workspaceId, ruleId: rule.id, accountId, firedAt: { gt: cooldownCutoff } },
    });
    // Monthly cap: at most max_per_month fires for this rule across the workspace.
    // UTC month boundary (server-local TZ would mis-bucket fires near midnight).
    const monthStart = new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), 1));
    const firesThisMonth = await prisma.routingRuleEvaluation.count({ where: { workspaceId, ruleId: rule.id, firedAt: { gte: monthStart } } });

    const suppressed = !!recentFire || firesThisMonth >= rule.maxPerMonth;
    await prisma.routingRuleEvaluation.create({
      data: { workspaceId, ruleId: rule.id, accountId, matched: true, firedAt: suppressed ? null : asOf },
    });
  }
  return matched;
}

// ── Daily decay recalculation (BullMQ scheduled job, 00:00 UTC) ──────────────

export async function runDailyDecayRecalculation(workspaceId: string, asOf: Date = new Date()): Promise<AccountStageChangedPayload[]> {
  const accounts = await prisma.awarenessScore.findMany({ where: { workspaceId }, select: { accountId: true, stage: true } });
  const today = asOf.toISOString().slice(0, 10);
  const stageChanges: AccountStageChangedPayload[] = [];
  for (const a of accounts) {
    const decayed = await decayedScoreForAccount(workspaceId, a.accountId, asOf);
    const stage = stageForScore(decayed.score);
    const stageChanged = stage !== a.stage;
    const score7dChange = decayed.score - (await scoreDaysAgo(workspaceId, a.accountId, 7, asOf));
    const score30dChange = decayed.score - (await scoreDaysAgo(workspaceId, a.accountId, 30, asOf));
    await prisma.$transaction(async (tx) => {
      await tx.awarenessScore.update({
        where: { workspaceId_accountId: { workspaceId, accountId: a.accountId } },
        data: { currentScore: decayed.score, stage, score7dChange, score30dChange, lastCalculatedAt: asOf },
      });
      if (stageChanged) {
        await tx.stageChangeLog.create({ data: { workspaceId, accountId: a.accountId, fromStage: a.stage, toStage: stage, score: decayed.score, changedAt: asOf } });
      }
      await tx.scoreSnapshot.upsert({
        where: { workspaceId_accountId_date: { workspaceId, accountId: a.accountId, date: new Date(today) } },
        create: { workspaceId, accountId: a.accountId, date: new Date(today), score: decayed.score, dominantSignalType: decayed.dominantSignalType },
        update: { score: decayed.score, dominantSignalType: decayed.dominantSignalType },
      });
    });
    // A decay-driven stage change (usually a demotion) must propagate downstream too —
    // returned for the queue worker to publish account.stage_changed.
    if (stageChanged) {
      stageChanges.push({ account_id: a.accountId, from_stage: a.stage as AwarenessStage, to_stage: stage, score: decayed.score, changed_at: asOf.toISOString() });
    }
  }
  return stageChanges;
}

/** All workspaces with awareness data — the daily job iterates these. */
export async function workspacesWithAwareness(): Promise<string[]> {
  const rows = await prisma.awarenessScore.findMany({ distinct: ['workspaceId'], select: { workspaceId: true } });
  return rows.map((r) => r.workspaceId);
}

// ── Read / API support ───────────────────────────────────────────────────────

/** Hot accounts feed, ranked by score (GET /awareness/feed). */
export async function getFeed(workspaceId: string, opts: { minScore?: number; stage?: string } = {}) {
  const scores = await prisma.awarenessScore.findMany({
    where: { workspaceId, ...(opts.minScore ? { currentScore: { gte: opts.minScore } } : {}), ...(opts.stage ? { stage: opts.stage } : {}) },
    orderBy: { currentScore: 'desc' },
    take: 50,
  });
  const accountIds = scores.map((s) => s.accountId);
  const [accts, signals] = await Promise.all([
    prisma.talAccount.findMany({ where: { workspaceId, accountId: { in: accountIds } }, select: { accountId: true, name: true, domain: true, tier: true } }),
    prisma.signal.findMany({ where: { workspaceId, accountId: { in: accountIds } }, orderBy: { occurredAt: 'desc' }, select: { accountId: true, signalType: true, occurredAt: true } }),
  ]);
  const acctMap = new Map(accts.map((a) => [a.accountId, a]));
  const sigMap = new Map<string, Array<{ signal_type: string; occurred_at: string }>>();
  for (const s of signals) {
    const list = sigMap.get(s.accountId) ?? [];
    if (list.length < 3) list.push({ signal_type: s.signalType, occurred_at: s.occurredAt.toISOString() });
    sigMap.set(s.accountId, list);
  }
  return scores.map((s) => ({
    account_id: s.accountId,
    name: acctMap.get(s.accountId)?.name ?? null,
    domain: acctMap.get(s.accountId)?.domain ?? null,
    tier: acctMap.get(s.accountId)?.tier ?? null,
    score: s.currentScore,
    stage: s.stage,
    score_7d_change: s.score7dChange,
    last_signal_at: s.lastSignalAt?.toISOString() ?? null,
    top_signals: sigMap.get(s.accountId) ?? [],
  }));
}

/** Current score + 30-day snapshot history + signal timeline (GET /awareness/score/:id). */
export async function getScoreDetail(workspaceId: string, accountId: string) {
  const [score, snapshots, decayed] = await Promise.all([
    prisma.awarenessScore.findUnique({ where: { workspaceId_accountId: { workspaceId, accountId } } }),
    prisma.scoreSnapshot.findMany({ where: { workspaceId, accountId }, orderBy: { date: 'asc' }, take: 30, select: { date: true, score: true } }),
    decayedScoreForAccount(workspaceId, accountId),
  ]);
  return {
    account_id: accountId,
    current_score: score?.currentScore ?? decayed.score,
    stage: score?.stage ?? stageForScore(decayed.score),
    score_7d_change: score?.score7dChange ?? 0,
    score_30d_change: score?.score30dChange ?? 0,
    dominant_signal_type: decayed.dominantSignalType,
    history: snapshots.map((s) => ({ date: s.date.toISOString().slice(0, 10), score: s.score })),
    recent_signals: decayed.topSignals,
  };
}

export async function listRoutingRules(workspaceId: string) {
  return prisma.routingRule.findMany({ where: { workspaceId }, orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }] });
}

export async function createRoutingRule(workspaceId: string, input: { name: string; trigger_config?: TriggerConfig; actions?: string[]; priority?: number; cooldown_days?: number; max_per_month?: number; is_active?: boolean }) {
  if (!input.name?.trim()) throw new Error('Routing rule name is required.');
  return prisma.routingRule.create({
    data: {
      workspaceId, name: input.name.trim(), isActive: input.is_active ?? true,
      triggerConfig: (input.trigger_config ?? {}) as Prisma.InputJsonValue,
      actions: input.actions ?? ['slack_alert'], priority: input.priority ?? 0,
      cooldownDays: input.cooldown_days ?? 7, maxPerMonth: input.max_per_month ?? 4,
    },
  });
}

export async function updateRoutingRule(workspaceId: string, id: string, patch: { name?: string; is_active?: boolean; trigger_config?: TriggerConfig; actions?: string[]; priority?: number; cooldown_days?: number; max_per_month?: number }) {
  const existing = await prisma.routingRule.findFirst({ where: { id, workspaceId }, select: { id: true } });
  if (!existing) throw new Error('Routing rule not found.');
  return prisma.routingRule.update({
    where: { id, workspaceId },
    data: {
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.is_active !== undefined ? { isActive: patch.is_active } : {}),
      ...(patch.trigger_config !== undefined ? { triggerConfig: patch.trigger_config as Prisma.InputJsonValue } : {}),
      ...(patch.actions !== undefined ? { actions: patch.actions } : {}),
      ...(patch.priority !== undefined ? { priority: patch.priority } : {}),
      ...(patch.cooldown_days !== undefined ? { cooldownDays: patch.cooldown_days } : {}),
      ...(patch.max_per_month !== undefined ? { maxPerMonth: patch.max_per_month } : {}),
    },
  });
}
