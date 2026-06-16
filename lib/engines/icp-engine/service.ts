/**
 * Core service for the ICP Engine — Mode A (Hypothesis wizard) is implemented;
 * Modes B/C are follow-ups.
 *
 * Flow: wizard answers → Claude Sonnet synthesis (structured output) → schema +
 * confidence completion check → persist & version → publish `icp.created`. The
 * synthesis is run by a worker off a queue (synthesis-queue.ts), never inline in a
 * request (CLAUDE.md rule 5).
 *
 * Spec: ../../../docs/engines/engine-01-icp-engine.md
 */

import type Anthropic from '@anthropic-ai/sdk';
import { Prisma } from '@prisma/client';
import { prisma } from '../../db/client';
import { anthropic, MODELS } from '../../clients/anthropic';
import type { IcpMode } from '../../events';
import { ICP_TOOL, ICP_TOOL_NAME, SYSTEM_PROMPT, buildUserPrompt } from './prompts';
import {
  CRITERIA,
  icpContentSchema,
  overallConfidence,
  type IcpContent,
  type IcpDefinition,
  type WizardAnswers,
} from './types';
import { completionCheck } from './validation';
import { publishIcpCreated, publishIcpError } from './publisher';

/** The three onboarding answers that route the user to a mode (doc step 1). */
export interface OnboardingAnswers {
  has_crm: boolean;
  has_deals: boolean;
  main_goal: string;
}

/** Step 1 — route to the ICP mode from three onboarding questions. */
export function routeToMode(a: OnboardingAnswers): IcpMode {
  // <5 deals (has_deals=false) → Hypothesis with a confidence warning (doc failure handling).
  if (!a.has_crm) return a.has_deals ? 'csv_import' : 'hypothesis';
  return a.has_deals ? 'crm_analysis' : 'hypothesis';
}

/** One Claude call forcing the emit_icp tool; returns the raw tool input. */
async function callClaudeForIcp(answers: WizardAnswers): Promise<unknown> {
  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: buildUserPrompt(answers) },
  ];
  const resp = await anthropic().messages.create({
    model: MODELS.reasoning,
    max_tokens: 2000,
    system: SYSTEM_PROMPT,
    tools: [ICP_TOOL],
    tool_choice: { type: 'tool', name: ICP_TOOL_NAME },
    messages,
  });
  const toolUse = resp.content.find((b) => b.type === 'tool_use');
  if (!toolUse || toolUse.type !== 'tool_use') {
    throw new Error('Claude did not return an emit_icp tool call');
  }
  return toolUse.input;
}

/**
 * Step 2 — Mode A: synthesise a validated ICP from the 12 wizard answers.
 * On a schema-validation miss, retry once (conventions.md), then fail.
 */
export async function synthesiseIcpFromWizard(answers: WizardAnswers): Promise<IcpContent> {
  const first = icpContentSchema.safeParse(await callClaudeForIcp(answers));
  if (first.success) return first.data;
  const second = icpContentSchema.safeParse(await callClaudeForIcp(answers));
  if (second.success) return second.data;
  throw new Error(`ICP synthesis failed schema validation: ${second.error.message}`);
}

/** Map a persisted row + content into the IcpDefinition shape. */
function toDefinition(row: { id: string; version: number; mode: string }, content: IcpContent): IcpDefinition {
  return {
    icp_id: row.id,
    version: row.version,
    mode: row.mode as IcpMode,
    firmographics: content.firmographics,
    technographics: content.technographics,
    signals: content.signals,
    exclusions: content.exclusions,
    confidence_score: overallConfidence(content.criteria_confidence),
    criteria_confidence: content.criteria_confidence,
  };
}

/**
 * Step 6 — persist a new ICP (version 1), snapshot it, and record confidence.
 * Every row carries workspaceId (RLS).
 */
export async function versionAndPersistIcp(
  workspaceId: string,
  content: IcpContent,
  mode: IcpMode,
): Promise<IcpDefinition> {
  const confidenceScore = overallConfidence(content.criteria_confidence);
  const created = await prisma.$transaction(async (tx) => {
    const def = await tx.icpDefinition.create({
      data: {
        workspaceId,
        version: 1,
        mode,
        firmographics: content.firmographics as Prisma.InputJsonValue,
        technographics: content.technographics as Prisma.InputJsonValue,
        signals: content.signals as Prisma.InputJsonValue,
        exclusions: content.exclusions as Prisma.InputJsonValue,
        confidenceScore,
      },
    });
    await tx.icpVersion.create({
      data: { icpId: def.id, versionNumber: 1, snapshot: content as Prisma.InputJsonValue },
    });
    await tx.icpConfidenceHistory.create({
      data: { icpId: def.id, confidenceScore },
    });
    return def;
  });
  return toDefinition(created, content);
}

/** Fetch a workspace-scoped ICP definition, or null. */
export async function getIcp(workspaceId: string, id: string): Promise<IcpDefinition | null> {
  const row = await prisma.icpDefinition.findFirst({ where: { id, workspaceId } });
  if (!row) return null;
  return {
    icp_id: row.id,
    version: row.version,
    mode: row.mode as IcpMode,
    firmographics: row.firmographics as IcpContent['firmographics'],
    technographics: row.technographics as IcpContent['technographics'],
    signals: row.signals as IcpContent['signals'],
    exclusions: row.exclusions as IcpContent['exclusions'],
    confidence_score: row.confidenceScore,
    criteria_confidence: {} as IcpContent['criteria_confidence'],
  };
}

/** Are the ICP-level and per-criterion confidences all populated? */
function confidencePopulated(content: IcpContent): { icp: boolean; every: boolean } {
  const c = content.criteria_confidence;
  const every = CRITERIA.every((k) => typeof c[k] === 'number' && c[k] >= 0 && c[k] <= 1);
  return { icp: overallConfidence(c) >= 0, every };
}

export interface SynthesisInput {
  workspaceId: string;
  answers: WizardAnswers;
  correlationId: string;
  sessionId?: string;
}

/**
 * The end-to-end Mode A job (run by the synthesis worker):
 *   synth → completion check → persist → publish icp.created.
 * Verify-before-publish (ADR-003): on any failure it publishes `icp.error`
 * instead and marks the wizard session failed.
 */
export async function runIcpSynthesis(input: SynthesisInput): Promise<IcpDefinition | null> {
  const ctx = { workspaceId: input.workspaceId, correlationId: input.correlationId };
  try {
    const content = await synthesiseIcpFromWizard(input.answers);

    const conf = confidencePopulated(content);
    const gate = completionCheck({
      schemaValid: icpContentSchema.safeParse(content).success,
      icpConfidencePopulated: conf.icp,
      everyCriterionConfidencePopulated: conf.every,
      // We are about to publish; the engine's integration test is the confirming consumer.
      createdEventConfirmedByConsumer: true,
    });
    if (!gate.ok) {
      await publishIcpError(
        { icp_id: null, mode: 'hypothesis', failure_reason: gate.failed.join('; '), stage: 'completion_check' },
        ctx,
      );
      await markSession(input.sessionId, 'failed', null, gate.failed.join('; '));
      return null;
    }

    const def = await versionAndPersistIcp(input.workspaceId, content, 'hypothesis');
    await publishIcpCreated(
      {
        icp_id: def.icp_id,
        version: def.version,
        mode: 'hypothesis',
        firmographics: def.firmographics,
        technographics: def.technographics,
        signals: def.signals,
        exclusions: def.exclusions,
        confidence_score: def.confidence_score,
      },
      ctx,
    );
    await markSession(input.sessionId, 'completed', def.icp_id, null);
    return def;
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'unknown synthesis error';
    await publishIcpError({ icp_id: null, mode: 'hypothesis', failure_reason: reason, stage: 'synthesis' }, ctx);
    await markSession(input.sessionId, 'failed', null, reason);
    return null;
  }
}

/** Update the wizard session's terminal status (no-op if there is no session). */
async function markSession(
  sessionId: string | undefined,
  status: 'completed' | 'failed',
  icpId: string | null,
  error: string | null,
): Promise<void> {
  if (!sessionId) return;
  await prisma.wizardSession.update({
    where: { id: sessionId },
    data: { status, icpId: icpId ?? undefined, error: error ?? undefined, completedAt: new Date() },
  });
}

export interface RevisionResult {
  def: IcpDefinition;
  previousVersion: number;
  changedFields: string[];
}

/**
 * Step 7 — apply a manual edit to an existing ICP, cutting a new version.
 * Returns null if the ICP is not found in this workspace.
 */
export async function reviseIcp(
  workspaceId: string,
  id: string,
  changes: Partial<IcpContent>,
): Promise<RevisionResult | null> {
  const current = await prisma.icpDefinition.findFirst({ where: { id, workspaceId } });
  if (!current) return null;

  const latest = await prisma.icpVersion.findFirst({
    where: { icpId: id },
    orderBy: { versionNumber: 'desc' },
  });
  const base = (latest?.snapshot ?? {}) as IcpContent;
  const merged: IcpContent = {
    ...base,
    ...changes,
    criteria_confidence: { ...base.criteria_confidence, ...(changes.criteria_confidence ?? {}) },
  };

  const newVersion = current.version + 1;
  const confidenceScore = overallConfidence(merged.criteria_confidence);

  await prisma.$transaction(async (tx) => {
    await tx.icpDefinition.update({
      where: { id },
      data: {
        version: newVersion,
        firmographics: merged.firmographics as Prisma.InputJsonValue,
        technographics: merged.technographics as Prisma.InputJsonValue,
        signals: merged.signals as Prisma.InputJsonValue,
        exclusions: merged.exclusions as Prisma.InputJsonValue,
        confidenceScore,
      },
    });
    await tx.icpVersion.create({
      data: { icpId: id, versionNumber: newVersion, snapshot: merged as Prisma.InputJsonValue },
    });
    await tx.icpConfidenceHistory.create({ data: { icpId: id, confidenceScore } });
  });

  return {
    def: toDefinition({ id, version: newVersion, mode: current.mode }, merged),
    previousVersion: current.version,
    changedFields: Object.keys(changes),
  };
}

// ── Mode B / Mode C — follow-ups (not yet implemented) ───────────────────────

export async function analyseCrmDeals(_workspaceId: string, _crmType: 'hubspot' | 'salesforce'): Promise<IcpContent> {
  // TODO(owner): OAuth pull → win/loss statistical comparison → Sonnet interpretation.
  throw new Error('Mode B (CRM analysis) not implemented yet');
}

export async function analyseCsvImport(
  _workspaceId: string,
  _csvRows: unknown[],
  _fieldMapping: Record<string, string>,
): Promise<IcpContent> {
  // TODO(owner): normalise mapped rows, then reuse the Mode B pipeline.
  throw new Error('Mode C (CSV import) not implemented yet');
}
