/**
 * Core service for the Demand Gen Orchestrator (Engine 09).
 *
 * "Where intelligence becomes action": given an awareness trigger, evaluate the
 * tier×stage play matrix → check suppression atomically → fire the play (CRM task
 * via Engine 10 + mock Slack, or sequence enrolment) → log it → publish play.fired.
 *
 * Owned tables: plays_log, play_templates, play_outcomes, suppression_rules,
 * sequence_mappings, ai_draft_log.
 *
 * MVP mocks (no paid keys): Slack send + sequence enrolment are mocked; the CRM
 * task is delegated to Engine 10 via play.fired (crm_task_id filled CRM-side).
 * NOTE (cross-engine read): tier is resolved from tal_accounts (Engine 05) — the
 * established MVP pattern (ADR-013).
 */

import { prisma } from '../../db/client';
import { Prisma } from '@prisma/client';
import { llmProvider, llmStructured, activeModelLabel } from '../../clients/llm';
import type {
  AccountStageChangedPayload, AccountHotPayload, PlayFiredPayload, PlayOutcomeRecordedPayload,
  Tier, AwarenessStage, Json,
} from '../../events';

export interface PlayTrigger {
  workspaceId: string;
  accountId: string;
  tier: Tier;
  stage: AwarenessStage;
  triggerType: 'account.stage_changed' | 'account.hot';
  triggerSignalId: string | null;
  correlationId: string;
}

export interface ResolvedPlay {
  playType: string;
  tier: Tier;
  stage: AwarenessStage;
  executionMethod: string;
  templateConfig: Json;
}

export interface SuppressionDecision {
  suppressed: boolean;
  reason: string | null; // cooldown | max_per_month | not_interested | snoozed | concurrent | null
}

export type OrchestrationResult =
  | { status: 'fired'; payload: PlayFiredPayload }
  | { status: 'suppressed'; reason: string }
  | { status: 'no_play'; reason: string };

// ── Step 2: the play matrix (workspace template override → code default) ─────

const CRM_SLACK = 'crm_task_slack';
const SEQUENCE = 'sequence';

/** Deterministic default tier×stage (and hot) matrix when no workspace template exists. */
export function defaultPlay(tier: Tier, stage: AwarenessStage, triggerType: PlayTrigger['triggerType']): { playType: string; executionMethod: string } {
  const lateStage = stage === 'considering' || stage === 'selecting';
  if (triggerType === 'account.hot') {
    if (tier === 1) {
      // Urgency scales with stage: a late-stage hot account warrants escalation,
      // an early-stage one a lighter alert.
      return { playType: lateStage ? 'hot_account_escalation' : 'hot_account_alert', executionMethod: CRM_SLACK };
    }
    return { playType: 'hot_account_fast_track', executionMethod: SEQUENCE };
  }
  if (tier === 1) {
    return lateStage
      ? { playType: 'executive_engagement', executionMethod: CRM_SLACK }
      : { playType: 'sdr_outreach', executionMethod: CRM_SLACK };
  }
  if (tier === 2) return { playType: 'nurture_sequence', executionMethod: SEQUENCE };
  return { playType: 'low_touch_sequence', executionMethod: SEQUENCE };
}

export async function evaluatePlayMatrix(trigger: PlayTrigger): Promise<ResolvedPlay> {
  const tmpl = await prisma.playTemplate.findFirst({
    where: { workspaceId: trigger.workspaceId, tier: trigger.tier, stage: trigger.stage, isActive: true },
  });
  if (tmpl) {
    return { playType: tmpl.playType, tier: trigger.tier, stage: trigger.stage, executionMethod: tmpl.executionMethod, templateConfig: tmpl.templateConfig as Json };
  }
  const d = defaultPlay(trigger.tier, trigger.stage, trigger.triggerType);
  return { playType: d.playType, tier: trigger.tier, stage: trigger.stage, executionMethod: d.executionMethod, templateConfig: { source: 'default_matrix' } };
}

// ── Step 3: atomic suppression (Redis per-account lock + cooldown/cap) ───────

/** Either the base client or a transaction client — lets the atomic path thread one tx. */
type Db = typeof prisma | Prisma.TransactionClient;

export async function checkSuppression(trigger: PlayTrigger, asOf: Date = new Date(), db: Db = prisma): Promise<SuppressionDecision> {
  const rule = await db.suppressionRule.findFirst({ where: { workspaceId: trigger.workspaceId, ruleType: 'cooldown', isActive: true } });
  const cooldownDays = rule?.cooldownDays ?? 7;
  const maxPerMonth = rule?.maxPerMonth ?? 4;
  const active = { in: ['fired', 'enrolled'] };

  // Hard blocks: a rep marked the account not-interested, or it's snoozed.
  const blocked = await db.playsLog.findFirst({
    where: { workspaceId: trigger.workspaceId, accountId: trigger.accountId, OR: [{ outcome: 'not_interested' }, { status: 'snoozed', snoozedUntil: { gt: asOf } }] },
    orderBy: { firedAt: 'desc' },
  });
  if (blocked) return { suppressed: true, reason: blocked.outcome === 'not_interested' ? 'not_interested' : 'snoozed' };

  // Cooldown: no new play until STRICTLY more than cooldown_days after the last one
  // (gt, not gte — a play exactly N days old no longer blocks).
  const cooldownCutoff = new Date(asOf.getTime() - cooldownDays * 24 * 3600 * 1000);
  const recent = await db.playsLog.findFirst({ where: { workspaceId: trigger.workspaceId, accountId: trigger.accountId, status: active, firedAt: { gt: cooldownCutoff } } });
  if (recent) return { suppressed: true, reason: 'cooldown' };

  // Monthly cap — month boundary in UTC (server-local TZ would mis-bucket fires near midnight).
  const monthStart = new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), 1));
  const count = await db.playsLog.count({ where: { workspaceId: trigger.workspaceId, accountId: trigger.accountId, status: active, firedAt: { gte: monthStart } } });
  if (count >= maxPerMonth) return { suppressed: true, reason: 'max_per_month' };

  return { suppressed: false, reason: null };
}

// ── Tier resolution (cross-engine read of tal_accounts) ──────────────────────

export async function resolveTier(workspaceId: string, accountId: string): Promise<Tier | null> {
  const row = await prisma.talAccount.findFirst({ where: { workspaceId, accountId }, select: { tier: true } });
  if (!row || row.tier == null) return null;
  return row.tier as Tier;
}

// ── Steps 4/5/7: fire the play (tier-routed) + persist plays_log ─────────────

function mockSlackTs(): string {
  // Slack message ts format is "<unix>.<seq>"; deterministic-ish placeholder for MVP.
  return `${Math.floor(Date.now() / 1000)}.000100`;
}

async function persistPlay(trigger: PlayTrigger, play: ResolvedPlay, fields: { status: string; slackMessageTs: string | null; assignedTo: string | null; contactId: string | null }, db: Db = prisma): Promise<PlayFiredPayload> {
  const row = await db.playsLog.upsert({
    where: { workspaceId_accountId_correlationId: { workspaceId: trigger.workspaceId, accountId: trigger.accountId, correlationId: trigger.correlationId } },
    create: {
      workspaceId: trigger.workspaceId, accountId: trigger.accountId, contactId: fields.contactId,
      playType: play.playType, triggerType: trigger.triggerType, triggerSignalId: trigger.triggerSignalId,
      executionMethod: play.executionMethod, status: fields.status, slackMessageTs: fields.slackMessageTs,
      assignedTo: fields.assignedTo, correlationId: trigger.correlationId,
    },
    update: {}, // idempotent: a retry of the same trigger returns the existing play
  });
  return {
    play_id: row.id, account_id: row.accountId, contact_id: row.contactId, play_type: row.playType,
    tier: trigger.tier, stage: trigger.stage, trigger_type: row.triggerType, trigger_signal_id: row.triggerSignalId,
    execution_method: row.executionMethod, crm_task_id: row.crmTaskId, slack_message_ts: row.slackMessageTs,
    assigned_to: row.assignedTo, status: row.status, fired_at: row.firedAt.toISOString(),
  };
}

/** Tier 1: CRM task (via Engine 10 on play.fired) + mock Slack alert. */
export async function fireTier1Play(trigger: PlayTrigger, play: ResolvedPlay, db: Db = prisma): Promise<PlayFiredPayload> {
  // Attribute to the account's most-confident decision-maker if one is mapped
  // (cross-engine read; deterministic via orderBy — an account can have several DMs).
  const dm = await db.contact.findFirst({
    where: { workspaceId: trigger.workspaceId, accountId: trigger.accountId, stakeholderRole: 'decision_maker' },
    orderBy: [{ roleConfidence: 'desc' }, { sourcedAt: 'asc' }],
    select: { id: true },
  });
  return persistPlay(trigger, play, { status: 'fired', slackMessageTs: mockSlackTs(), assignedTo: 'unassigned', contactId: dm?.id ?? null }, db);
}

/** Tier 2/3: enrol in a pre-configured sequence (resolved from sequence_mappings). */
export async function fireTier23Play(trigger: PlayTrigger, play: ResolvedPlay, db: Db = prisma): Promise<PlayFiredPayload> {
  const mapping = await db.sequenceMapping.findFirst({ where: { workspaceId: trigger.workspaceId, tier: trigger.tier }, select: { sequenceId: true } });
  void mapping; // MVP: enrolment is mocked; mapping resolves the target sequence when wired live.
  return persistPlay(trigger, play, { status: 'enrolled', slackMessageTs: null, assignedTo: null, contactId: null }, db);
}

// ── Orchestration entry point ────────────────────────────────────────────────

export async function runOrchestration(trigger: PlayTrigger, asOf: Date = new Date()): Promise<OrchestrationResult> {
  const play = await evaluatePlayMatrix(trigger); // pure-ish read; fine outside the lock

  // Atomic check-and-lock (doc completion check #2): serialize per account with a
  // Postgres advisory xact lock so the suppression check and the fire are ONE unit —
  // across processes and independent of Redis. The lock auto-releases at txn end.
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`play:${trigger.workspaceId}:${trigger.accountId}`}))`;

    const suppression = await checkSuppression(trigger, asOf, tx);
    if (suppression.suppressed) return { status: 'suppressed', reason: suppression.reason ?? 'suppressed' };

    const payload = play.executionMethod === SEQUENCE
      ? await fireTier23Play(trigger, play, tx)
      : await fireTier1Play(trigger, play, tx);
    return { status: 'fired', payload };
  });
}

// ── Trigger mappers (tier resolved by the handler) ───────────────────────────

export function triggerFromStageChanged(workspaceId: string, payload: AccountStageChangedPayload, tier: Tier, correlationId: string): PlayTrigger {
  return { workspaceId, accountId: payload.account_id, tier, stage: payload.to_stage, triggerType: 'account.stage_changed', triggerSignalId: null, correlationId };
}

export function triggerFromAccountHot(workspaceId: string, payload: AccountHotPayload, tier: Tier, correlationId: string): PlayTrigger {
  return { workspaceId, accountId: payload.account_id, tier, stage: payload.stage, triggerType: 'account.hot', triggerSignalId: payload.dominant_signal_type ?? null, correlationId };
}

// ── Outcomes + snooze ────────────────────────────────────────────────────────

export async function recordOutcome(workspaceId: string, playId: string, outcome: string, notes: string | null): Promise<PlayOutcomeRecordedPayload> {
  const play = await prisma.playsLog.findFirst({ where: { id: playId, workspaceId }, select: { id: true, accountId: true } });
  if (!play) throw new Error('Play not found.');
  const [, ] = await prisma.$transaction([
    prisma.playOutcome.create({ data: { workspaceId, playId, outcome, notes } }),
    prisma.playsLog.update({ where: { id: playId, workspaceId }, data: { outcome } }),
  ]);
  return { play_id: playId, account_id: play.accountId, outcome, notes, recorded_at: new Date().toISOString() };
}

export async function snoozePlay(workspaceId: string, playId: string, days: number): Promise<{ id: string; snoozed_until: string }> {
  const until = new Date(Date.now() + Math.max(1, days) * 24 * 3600 * 1000);
  const play = await prisma.playsLog.findFirst({ where: { id: playId, workspaceId }, select: { id: true } });
  if (!play) throw new Error('Play not found.');
  await prisma.playsLog.update({ where: { id: playId, workspaceId }, data: { status: 'snoozed', snoozedUntil: until } });
  return { id: playId, snoozed_until: until.toISOString() };
}

// ── Step 6: AI email draft (Claude Sonnet, fallback when no key) ──────────────

export async function generateAiDraft(workspaceId: string, playId: string): Promise<{ subjectLines: string[]; body: string; modelUsed: string }> {
  const play = await prisma.playsLog.findFirst({ where: { id: playId, workspaceId } });
  if (!play) throw new Error('Play not found.');
  const acct = await prisma.talAccount.findFirst({ where: { workspaceId, accountId: play.accountId }, select: { name: true } });
  const company = acct?.name ?? 'the account';

  let draft: { subjectLines: string[]; body: string; modelUsed: string };
  try {
    // Provider-agnostic (Ollama default | Anthropic). Mock mode skips straight to
    // the template fallback below.
    if (llmProvider() === 'mock') throw new Error('llm mock mode');
    const parsed = await llmStructured({
      toolName: 'emit_email_draft',
      schema: {
        type: 'object',
        required: ['subject_lines', 'body'],
        properties: {
          subject_lines: { type: 'array', items: { type: 'string' }, description: '3 subject lines' },
          body: { type: 'string', description: 'email body, under 120 words' },
        },
      },
      system: 'You are a B2B sales copywriter. Write concise, specific outreach with no fluff.',
      user: `Write a concise B2B sales outreach email to ${company}. Their buying signal: ${play.playType} (${play.triggerType}). 3 subject lines and a body under 120 words.`,
      model: 'reasoning',
      maxTokens: 700,
      temperature: 0.6,
    });
    // Validate the SHAPE at runtime — a structurally-valid-but-wrong response must
    // fall through to the fallback, not corrupt the draft / crash the DB insert.
    if (!Array.isArray(parsed.subject_lines) || !parsed.subject_lines.every((s) => typeof s === 'string') || typeof parsed.body !== 'string') {
      throw new Error('malformed draft JSON shape');
    }
    draft = { subjectLines: (parsed.subject_lines as string[]).slice(0, 3), body: parsed.body as string, modelUsed: activeModelLabel('reasoning') };
  } catch {
    // Fallback template draft (failure is non-fatal — surface the task without AI; doc).
    draft = {
      subjectLines: [`Quick question, ${company}`, `Saw your team exploring solutions`, `Worth a 15-min chat?`],
      body: `Hi there,\n\nNoticed ${company} has been actively researching in our space. Teams at your stage usually care most about time-to-value and a clean rollout. Happy to share how similar companies got there in weeks, not quarters.\n\nWorth a quick chat this week?\n\nBest,`,
      modelUsed: 'fallback_template',
    };
  }
  await prisma.aiDraftLog.create({ data: { workspaceId, playId, subjectLines: draft.subjectLines, body: draft.body, modelUsed: draft.modelUsed } });
  return draft;
}

// ── Reads / API support ──────────────────────────────────────────────────────

export async function getPlayFeed(workspaceId: string, opts: { status?: string } = {}) {
  const plays = await prisma.playsLog.findMany({
    where: { workspaceId, ...(opts.status ? { status: opts.status } : {}) },
    orderBy: { firedAt: 'desc' },
    take: 100,
  });
  const accountIds = [...new Set(plays.map((p) => p.accountId))];
  const accts = await prisma.talAccount.findMany({ where: { workspaceId, accountId: { in: accountIds } }, select: { accountId: true, name: true, domain: true, tier: true } });
  const map = new Map(accts.map((a) => [a.accountId, a]));
  return plays.map((p) => ({
    id: p.id, account_id: p.accountId, account_name: map.get(p.accountId)?.name ?? null, domain: map.get(p.accountId)?.domain ?? null,
    play_type: p.playType, trigger_type: p.triggerType, execution_method: p.executionMethod, status: p.status,
    tier: map.get(p.accountId)?.tier ?? null, assigned_to: p.assignedTo, outcome: p.outcome, fired_at: p.firedAt.toISOString(),
  }));
}

/** Manual fire (POST /plays/fire): build a trigger from explicit input + run orchestration. */
export async function fireManualPlay(workspaceId: string, input: { account_id: string; stage?: AwarenessStage; trigger_type?: PlayTrigger['triggerType'] }, correlationId: string): Promise<OrchestrationResult> {
  const tier = await resolveTier(workspaceId, input.account_id);
  if (tier == null) return { status: 'no_play', reason: 'account not on the TAL' };
  const trigger: PlayTrigger = {
    workspaceId, accountId: input.account_id, tier, stage: input.stage ?? 'considering',
    triggerType: input.trigger_type ?? 'account.stage_changed', triggerSignalId: null, correlationId,
  };
  return runOrchestration(trigger);
}
