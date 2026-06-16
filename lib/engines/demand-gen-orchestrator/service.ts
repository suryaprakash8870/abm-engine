/**
 * Core service for the Demand Gen Orchestrator (Engine 09).
 *
 * This is "where intelligence becomes action": given an awareness trigger, it
 * evaluates the play matrix, checks suppression, fires the play (CRM task / Slack /
 * AI draft / sequence enrolment) and logs the result.
 *
 * These are compiling stubs — each step from the doc's "Step-by-step job" is a
 * typed function whose body is a TODO. Prisma models for this engine do not exist
 * yet, so they are referenced ONLY in comments (never in type-checked positions).
 *
 * Prisma tables this engine owns (see prisma/schema/demand-gen-orchestrator.prisma):
 *   plays_log, play_templates, play_outcomes, suppression_rules,
 *   sequence_mappings, ai_draft_log
 */

import type {
  AccountStageChangedPayload,
  AccountHotPayload,
  PlayFiredPayload,
  PlayOutcomeRecordedPayload,
  Tier,
  AwarenessStage,
  Json,
} from '../../events';

/** The trigger that woke the orchestrator, normalised across the two consumed events. */
export interface PlayTrigger {
  workspaceId: string;
  accountId: string;
  tier: Tier;
  stage: AwarenessStage;
  triggerType: 'account.stage_changed' | 'account.hot';
  triggerSignalId: string | null;
  correlationId?: string;
}

/** A play template resolved from the tier × stage matrix (play_templates). */
export interface ResolvedPlay {
  playType: string;
  tier: Tier;
  stage: AwarenessStage;
  executionMethod: string; // 'crm_task' | 'slack' | 'sequence' | ...
  templateConfig: Json;
}

/** Result of the atomic suppression check-and-lock. */
export interface SuppressionDecision {
  suppressed: boolean;
  reason: string | null; // 'snoozed' | 'unsubscribed' | 'cooldown' | 'not_interested' | null
}

/** Outcome of firing a play — the raw material for the `play.fired` payload + plays_log row. */
export interface FiredPlay {
  playId: string;
  contactId: string | null;
  crmTaskId: string | null;
  slackMessageTs: string | null;
  assignedTo: string | null;
  status: string;
  firedAt: string;
}

/**
 * Step 2 — Evaluate the play matrix: tier × stage → play template.
 * Reads play_templates for the workspace.
 */
export async function evaluatePlayMatrix(
  _trigger: PlayTrigger,
): Promise<ResolvedPlay> {
  // TODO(owner): query play_templates WHERE workspace_id = trigger.workspaceId
  //   AND tier = trigger.tier AND stage = trigger.stage; pick the active template.
  throw new Error('not implemented');
}

/**
 * Step 3 — Check suppression rules BEFORE any external call.
 * MUST be atomic (check-and-lock) so we never double-fire or fire on a suppressed
 * account. Reads suppression_rules; consults snooze/cooldown/unsubscribe state.
 */
export async function checkSuppression(
  _trigger: PlayTrigger,
  _play: ResolvedPlay,
): Promise<SuppressionDecision> {
  // TODO(owner): atomic check-and-lock against suppression_rules + plays_log cooldown
  //   (cooldown_days, max_per_month). Use a Redis lock / Postgres advisory lock.
  throw new Error('not implemented');
}

/**
 * Step 4/5 — Tier 1: create a context-rich CRM task (via Engine 10) + Slack
 * notification with interactive buttons (View / Mark contacted / Snooze).
 */
export async function fireTier1Play(
  _trigger: PlayTrigger,
  _play: ResolvedPlay,
): Promise<FiredPlay> {
  // TODO(owner): create CRM task through crm-sync-engine, post Slack message,
  //   write a plays_log row, return its identifiers.
  throw new Error('not implemented');
}

/**
 * Step 7 — Tier 2/3: enrol contacts in pre-configured sequences (Outreach / Apollo).
 * Resolves the sequence via sequence_mappings (tier × industry × role).
 */
export async function fireTier23Play(
  _trigger: PlayTrigger,
  _play: ResolvedPlay,
): Promise<FiredPlay> {
  // TODO(owner): look up sequence_mappings, enrol contacts via Outreach/Apollo API,
  //   write a plays_log row, return its identifiers.
  throw new Error('not implemented');
}

/**
 * Step 6 — AI email draft on demand (Claude Sonnet 4.6): 3 subject lines + body
 * referencing the trigger signal, contact role, ICP pain point. Always rep-reviewed.
 * Logged to ai_draft_log. Failure is non-fatal (surface the task without a draft).
 */
export async function generateAiDraft(
  _playId: string,
  _trigger: PlayTrigger,
): Promise<{ subjectLines: string[]; body: string; modelUsed: string }> {
  // TODO(owner): call Claude Sonnet 4.6, persist to ai_draft_log, return draft.
  throw new Error('not implemented');
}

/**
 * Step 8 (log) — Persist the fired play to plays_log and assemble the
 * `play.fired` payload. Called after the play has been executed.
 */
export async function logPlay(
  _trigger: PlayTrigger,
  _play: ResolvedPlay,
  _fired: FiredPlay,
): Promise<PlayFiredPayload> {
  // TODO(owner): upsert plays_log row; build the PlayFiredPayload from it.
  throw new Error('not implemented');
}

/**
 * Step 8 (outcome) — Record the outcome of a previously-fired play in
 * play_outcomes and assemble the `play.outcome_recorded` payload.
 */
export async function recordOutcome(
  _playId: string,
  _accountId: string,
  _outcome: string,
  _notes: string | null,
): Promise<PlayOutcomeRecordedPayload> {
  // TODO(owner): insert into play_outcomes, update plays_log.outcome, build payload.
  throw new Error('not implemented');
}

/**
 * Orchestration entry point — runs the full step-by-step job for a single trigger:
 * evaluate matrix → check suppression → fire (tier-routed) → log → return payload.
 * The handler calls this, then the completion check, then the publisher.
 */
export async function runOrchestration(
  _trigger: PlayTrigger,
): Promise<PlayFiredPayload> {
  // TODO(owner): wire evaluatePlayMatrix → checkSuppression → fireTier1Play /
  //   fireTier23Play → logPlay. Bail early (and surface an error) if suppressed.
  throw new Error('not implemented');
}

/** Map an `account.stage_changed` payload onto the normalised PlayTrigger. */
export function triggerFromStageChanged(
  workspaceId: string,
  payload: AccountStageChangedPayload,
  correlationId?: string,
): PlayTrigger {
  // TODO(owner): resolve tier from the engine's local scoring/TAL copy.
  return {
    workspaceId,
    accountId: payload.account_id,
    tier: 1 as Tier, // TODO(owner): look up real tier
    stage: payload.to_stage,
    triggerType: 'account.stage_changed',
    triggerSignalId: null,
    correlationId,
  };
}

/** Map an `account.hot` payload onto the normalised PlayTrigger. */
export function triggerFromAccountHot(
  workspaceId: string,
  payload: AccountHotPayload,
  correlationId?: string,
): PlayTrigger {
  // TODO(owner): resolve tier from the engine's local scoring/TAL copy.
  return {
    workspaceId,
    accountId: payload.account_id,
    tier: 1 as Tier, // TODO(owner): look up real tier
    stage: payload.stage,
    triggerType: 'account.hot',
    triggerSignalId: null,
    correlationId,
  };
}
