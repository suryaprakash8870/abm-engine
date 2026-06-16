/**
 * Core service for the Awareness Engine (engine 08).
 *
 * Deterministic scoring + routing (NO LLM in this loop — scores must be
 * explainable/auditable). These are typed stubs of the "Step-by-step job" from
 * the engine doc; the owner fills in the bodies.
 *
 * Prisma models referenced (in comments only — they do not exist yet):
 *   awareness_scores, score_snapshots, routing_rules, routing_rule_evaluations,
 *   stage_change_log
 * See prisma/schema/awareness-engine.prisma.
 */

import type { AwarenessStage, Json, SignalReceivedPayload } from '../../events';

// ─────────────────────────────────────────────────────────────────────────────
// Domain types used by the steps below (kept local until the owner promotes them)
// ─────────────────────────────────────────────────────────────────────────────

/** The current persisted awareness state for one account (mirror of awareness_scores). */
export interface AccountAwarenessState {
  accountId: string;
  currentScore: number;
  stage: AwarenessStage;
  score7dChange: number;
  score30dChange: number;
  lastCalculatedAt: string; // ISO
  lastSignalAt: string | null; // ISO
}

/** A single historical signal contributing (with decay) to the current score. */
export interface ScoredSignal {
  signalType: string;
  pointsAwarded: number;
  decayRatePerWeek: number;
  occurredAt: string; // ISO
}

/** Result of a full recompute for one account. */
export interface ScoreComputation {
  previousScore: number;
  currentScore: number; // capped at 100
  fromStage: AwarenessStage;
  toStage: AwarenessStage;
  stageChanged: boolean;
  /** True when the score jumped > 20 points within the hot window (48h). */
  isHot: boolean;
  scoreChange: number;
  dominantSignalType: string;
}

/** A workspace routing rule (mirror of routing_rules). */
export interface RoutingRule {
  id: string;
  name: string;
  isActive: boolean;
  triggerConfig: Json; // JSONB: score thresholds, stage, signal-type filters
  actions: string[];
  priority: number;
  cooldownDays: number;
  maxPerMonth: number;
}

/** Outcome of evaluating one routing rule against an account's updated score. */
export interface RuleEvaluation {
  ruleId: string;
  accountId: string;
  matched: boolean;
  firedAt: string | null; // ISO; null when matched but suppressed by cooldown/cap
}

// ─────────────────────────────────────────────────────────────────────────────
// Step-by-step job (engine doc → typed stubs)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Step 1: Retrieve the account's current persisted awareness state.
 * Reads the awareness_scores row (or null for a never-scored account).
 */
export async function getAccountState(
  workspaceId: string,
  accountId: string,
): Promise<AccountAwarenessState | null> {
  // TODO(owner): SELECT from awareness_scores WHERE workspace_id + account_id.
  void workspaceId;
  void accountId;
  throw new Error('not implemented');
}

/**
 * Steps 2–3: Recompute the time-decayed contribution of every prior signal plus
 * the newly received one, apply per-signal decay rates (funding decays slowly,
 * pricing-page visits decay fast), and cap the total at 100.
 */
export function recomputeDecayedScore(
  priorSignals: ScoredSignal[],
  newSignal: SignalReceivedPayload,
  asOf: Date = new Date(),
): number {
  // TODO(owner): sum points * decayFactor(decayRatePerWeek, ageWeeks) over all
  // signals; cap at 100. decayFactor is a pure, auditable function.
  void priorSignals;
  void newSignal;
  void asOf;
  throw new Error('not implemented');
}

/** Step 4: Map a numeric score to its awareness stage (the five-stage ladder). */
export function stageForScore(score: number): AwarenessStage {
  // TODO(owner): identified < aware < interested < considering < selecting,
  // using the workspace's stage thresholds.
  void score;
  throw new Error('not implemented');
}

/**
 * Steps 2–5: Full recompute for one account from a new signal — produces the new
 * score, stage transition, and hot flag. Pure given the inputs (deterministic).
 */
export function computeScore(
  state: AccountAwarenessState | null,
  priorSignals: ScoredSignal[],
  newSignal: SignalReceivedPayload,
  asOf: Date = new Date(),
): ScoreComputation {
  // TODO(owner): recomputeDecayedScore → stageForScore → diff against `state` to
  // set stageChanged / isHot (jump > 20 pts within 48h) / scoreChange.
  void state;
  void priorSignals;
  void newSignal;
  void asOf;
  throw new Error('not implemented');
}

/**
 * Step 4: Persist the recomputed score + stage to awareness_scores, and append a
 * stage_change_log row when the stage changed. Idempotent on (workspace, account).
 */
export async function persistScore(
  workspaceId: string,
  accountId: string,
  computation: ScoreComputation,
  lastSignalAt: string,
): Promise<void> {
  // TODO(owner): UPSERT awareness_scores; INSERT stage_change_log if stageChanged.
  void workspaceId;
  void accountId;
  void computation;
  void lastSignalAt;
  throw new Error('not implemented');
}

/**
 * Step 6: Evaluate active workspace routing rules against the updated score and
 * record each evaluation. Matched rules are forwarded to the Orchestrator (via the
 * published events); cooldown_days / max_per_month gate firing.
 */
export async function evaluateRoutingRules(
  workspaceId: string,
  accountId: string,
  computation: ScoreComputation,
): Promise<RuleEvaluation[]> {
  // TODO(owner): SELECT active routing_rules; match triggerConfig vs score/stage;
  // honour cooldown_days + max_per_month; INSERT routing_rule_evaluations rows.
  void workspaceId;
  void accountId;
  void computation;
  throw new Error('not implemented');
}

/**
 * Step 8: Store a daily score snapshot per account (one row per account per day)
 * for the 30-day trend sparkline.
 */
export async function recordDailySnapshot(
  workspaceId: string,
  accountId: string,
  score: number,
  dominantSignalType: string,
  date: string = new Date().toISOString().slice(0, 10),
): Promise<void> {
  // TODO(owner): UPSERT score_snapshots on (account_id, date).
  void workspaceId;
  void accountId;
  void score;
  void dominantSignalType;
  void date;
  throw new Error('not implemented');
}

/**
 * Step 7: Daily decay recalculation job (00:00 UTC) — re-decays every account's
 * score so stale accounts cool off even without new signals. Wired as a BullMQ
 * scheduled job, NOT in a web request. Safe to retry (idempotent).
 */
export async function runDailyDecayRecalculation(workspaceId: string): Promise<void> {
  // TODO(owner): for each account in the workspace, recompute decayed score from
  // its signal history, persist, and write the daily snapshot. Queue-retry on fail.
  void workspaceId;
  throw new Error('not implemented');
}
