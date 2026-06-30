/**
 * Core service for the ICP Engine. All three modes are implemented:
 *   - Mode A (Hypothesis wizard)  → synthesiseIcpFromWizard → runIcpSynthesis
 *   - Mode B (CRM analysis)       → analyseDeals → runDealAnalysis
 *   - Mode C (CSV import)         → analyseDeals → runDealAnalysis
 *
 * Every mode produces the identical `IcpContent`, then funnels through the shared
 * `finalizeIcp` tail: completion check → persist & version → publish `icp.created`
 * (or `icp.error` on any failed check — verify-before-publish, ADR-003). Heavy work
 * is always queued, never run inline in a request (CLAUDE.md rule 5).
 *
 * Spec: ../../../docs/engines/engine-01-icp-engine.md
 */

import { Prisma } from '@prisma/client';
import { prisma } from '../../db/client';
import type { IcpMode } from '../../events';
import { SYSTEM_PROMPT, buildUserPrompt } from './prompts';
import { synthesiseContent } from './claude';
import { analyseDeals, InsufficientDealsError, type Deal } from './analysis';
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

/** Step 2 — Mode A: synthesise a validated ICP from the 12 wizard answers. */
export async function synthesiseIcpFromWizard(answers: WizardAnswers): Promise<IcpContent> {
  return synthesiseContent(SYSTEM_PROMPT, buildUserPrompt(answers));
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

/** Step 6 — persist a new ICP (version 1), snapshot it, and record confidence. */
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
    await tx.icpConfidenceHistory.create({ data: { icpId: def.id, confidenceScore } });
    return def;
  });
  return toDefinition(created, content);
}

/** List all ICPs for a workspace, newest first. */
export async function listIcps(workspaceId: string): Promise<IcpDefinition[]> {
  const rows = await prisma.icpDefinition.findMany({
    where: { workspaceId },
    orderBy: { createdAt: 'desc' },
    include: { versions: { orderBy: { versionNumber: 'desc' }, take: 1 } },
  });
  return rows.map((row) => {
    const snapshot = (row.versions[0]?.snapshot ?? null) as IcpContent | null;
    return {
      icp_id: row.id,
      version: row.version,
      mode: row.mode as IcpMode,
      firmographics: row.firmographics as IcpContent['firmographics'],
      technographics: row.technographics as IcpContent['technographics'],
      signals: row.signals as IcpContent['signals'],
      exclusions: row.exclusions as IcpContent['exclusions'],
      confidence_score: row.confidenceScore,
      criteria_confidence:
        snapshot?.criteria_confidence ?? { firmographics: 0, technographics: 0, signals: 0, exclusions: 0 },
    };
  });
}

/** Fetch a workspace-scoped ICP definition, or null. */
export async function getIcp(workspaceId: string, id: string): Promise<IcpDefinition | null> {
  const row = await prisma.icpDefinition.findFirst({ where: { id, workspaceId } });
  if (!row) return null;
  // Per-criterion confidence lives in the latest version snapshot, not on the row.
  const latest = await prisma.icpVersion.findFirst({ where: { icpId: id }, orderBy: { versionNumber: 'desc' } });
  const snapshot = (latest?.snapshot ?? null) as IcpContent | null;
  return {
    icp_id: row.id,
    version: row.version,
    mode: row.mode as IcpMode,
    firmographics: row.firmographics as IcpContent['firmographics'],
    technographics: row.technographics as IcpContent['technographics'],
    signals: row.signals as IcpContent['signals'],
    exclusions: row.exclusions as IcpContent['exclusions'],
    confidence_score: row.confidenceScore,
    criteria_confidence:
      snapshot?.criteria_confidence ?? { firmographics: 0, technographics: 0, signals: 0, exclusions: 0 },
  };
}

/** Are the ICP-level and per-criterion confidences all populated? */
function confidencePopulated(content: IcpContent): { icp: boolean; every: boolean } {
  const c = content.criteria_confidence;
  const every = CRITERIA.every((k) => typeof c[k] === 'number' && c[k] >= 0 && c[k] <= 1);
  return { icp: overallConfidence(c) >= 0, every };
}

/**
 * Shared tail for every mode: completion check → persist → publish `icp.created`.
 * On a failed check, publishes `icp.error` instead and returns ok:false.
 */
async function finalizeIcp(input: {
  workspaceId: string;
  content: IcpContent;
  mode: IcpMode;
  correlationId: string;
}): Promise<{ ok: boolean; def: IcpDefinition | null; reason?: string }> {
  const ctx = { workspaceId: input.workspaceId, correlationId: input.correlationId };
  const conf = confidencePopulated(input.content);
  const gate = completionCheck({
    schemaValid: icpContentSchema.safeParse(input.content).success,
    icpConfidencePopulated: conf.icp,
    everyCriterionConfidencePopulated: conf.every,
    // We are about to publish; the engine's integration test is the confirming consumer.
    createdEventConfirmedByConsumer: true,
  });
  if (!gate.ok) {
    const reason = gate.failed.join('; ');
    await publishIcpError({ icp_id: null, mode: input.mode, failure_reason: reason, stage: 'completion_check' }, ctx);
    return { ok: false, def: null, reason };
  }
  const def = await versionAndPersistIcp(input.workspaceId, input.content, input.mode);
  await publishIcpCreated(
    {
      icp_id: def.icp_id,
      version: def.version,
      mode: input.mode,
      firmographics: def.firmographics,
      technographics: def.technographics,
      signals: def.signals,
      exclusions: def.exclusions,
      confidence_score: def.confidence_score,
    },
    ctx,
  );
  return { ok: true, def };
}

export interface SynthesisInput {
  workspaceId: string;
  answers: WizardAnswers;
  correlationId: string;
  sessionId?: string;
  /** When set, refine THIS ICP (cut a new version) instead of creating a new ICP. */
  refineIcpId?: string;
}

/** The end-to-end Mode A job (run by the synthesis worker). */
export async function runIcpSynthesis(input: SynthesisInput): Promise<IcpDefinition | null> {
  const ctx = { workspaceId: input.workspaceId, correlationId: input.correlationId };
  try {
    const content = await synthesiseIcpFromWizard(input.answers);
    // Refine path: cut a new version of the existing ICP (history preserved).
    if (input.refineIcpId) {
      const rev = await reviseIcp(input.workspaceId, input.refineIcpId, content);
      if (!rev) {
        await markSession(input.sessionId, 'failed', null, 'ICP to refine was not found.');
        return null;
      }
      await markSession(input.sessionId, 'completed', rev.def.icp_id, null);
      return rev.def;
    }
    const result = await finalizeIcp({ workspaceId: input.workspaceId, content, mode: 'hypothesis', correlationId: input.correlationId });
    await markSession(input.sessionId, result.ok ? 'completed' : 'failed', result.def?.icp_id ?? null, result.ok ? null : result.reason ?? null);
    return result.def;
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'unknown synthesis error';
    await publishIcpError({ icp_id: null, mode: 'hypothesis', failure_reason: reason, stage: 'synthesis' }, ctx);
    await markSession(input.sessionId, 'failed', null, reason);
    return null;
  }
}

export interface DealAnalysisInput {
  workspaceId: string;
  jobId: string;
  mode: 'crm_analysis' | 'csv_import';
  deals: Deal[];
  correlationId: string;
}

/** The end-to-end Mode B/C job (run by the analysis worker). */
export async function runDealAnalysis(input: DealAnalysisInput): Promise<IcpDefinition | null> {
  const ctx = { workspaceId: input.workspaceId, correlationId: input.correlationId };
  try {
    const content = await analyseDeals(input.deals);
    const result = await finalizeIcp({ workspaceId: input.workspaceId, content, mode: input.mode, correlationId: input.correlationId });
    await markAnalysisJob(input.jobId, result.ok ? 'completed' : 'failed', result.def?.icp_id ?? null, result.ok ? null : result.reason ?? null);
    return result.def;
  } catch (err) {
    if (err instanceof InsufficientDealsError) {
      const reason = `Only ${err.wonCount} closed-won deals (<5) — use the wizard (Mode A).`;
      await publishIcpError({ icp_id: null, mode: input.mode, failure_reason: reason, stage: 'insufficient_deals' }, ctx);
      await markAnalysisJob(input.jobId, 'failed', null, reason);
      return null;
    }
    const reason = err instanceof Error ? err.message : 'unknown analysis error';
    await publishIcpError({ icp_id: null, mode: input.mode, failure_reason: reason, stage: 'analysis' }, ctx);
    await markAnalysisJob(input.jobId, 'failed', null, reason);
    return null;
  }
}

export interface RevisionResult {
  def: IcpDefinition;
  previousVersion: number;
  changedFields: string[];
}

/** Step 7 — apply a manual edit to an existing ICP, cutting a new version. */
export async function reviseIcp(
  workspaceId: string,
  id: string,
  changes: Partial<IcpContent>,
): Promise<RevisionResult | null> {
  const current = await prisma.icpDefinition.findFirst({ where: { id, workspaceId } });
  if (!current) return null;

  const latest = await prisma.icpVersion.findFirst({ where: { icpId: id }, orderBy: { versionNumber: 'desc' } });
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
    await tx.icpVersion.create({ data: { icpId: id, versionNumber: newVersion, snapshot: merged as Prisma.InputJsonValue } });
    await tx.icpConfidenceHistory.create({ data: { icpId: id, confidenceScore } });
  });

  return {
    def: toDefinition({ id, version: newVersion, mode: current.mode }, merged),
    previousVersion: current.version,
    changedFields: Object.keys(changes),
  };
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

/** Update the crm_analysis_job terminal status + result. */
async function markAnalysisJob(
  jobId: string,
  status: 'completed' | 'failed',
  icpId: string | null,
  error: string | null,
): Promise<void> {
  await prisma.crmAnalysisJob.update({
    where: { id: jobId },
    data: { status, result: { icpId, error } as Prisma.InputJsonValue },
  });
}
