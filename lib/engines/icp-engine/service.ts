/**
 * Core service for the ICP Engine.
 *
 * One stub per step of the doc's "Step-by-step job". Bodies are intentionally
 * unimplemented — the owner fills them in. Prisma models are referenced ONLY in
 * comments (they do not exist yet; see prisma/schema/icp-engine.prisma).
 *
 * Spec: ../../../docs/engines/engine-01-icp-engine.md
 */

import type { IcpMode, Json } from '../../events';

/** The structured ICP object produced identically by all three modes (step 5). */
export interface IcpDefinition {
  icp_id: string;
  version: number;
  mode: IcpMode;
  firmographics: Json;
  technographics: Json;
  signals: Json;
  exclusions: Json;
  /** Confidence for the ICP as a whole (0..1). */
  confidence_score: number;
  /** Per-criterion confidence — required by the task-completion check. */
  criteria_confidence: Record<string, number>;
}

/** The three onboarding answers that route the user to a mode (step 1). */
export interface OnboardingAnswers {
  has_crm: boolean;
  has_deals: boolean;
  main_goal: string;
}

/**
 * Step 1 — Route the user to the right ICP mode from three onboarding questions
 * (Has CRM? Has deals? Main goal?).
 */
export function routeToMode(_answers: OnboardingAnswers): IcpMode {
  // TODO(owner): decision logic. Failure handling: <5 deals → 'hypothesis' with a
  // confidence warning; HubSpot OAuth unavailable → fall back to 'csv_import'.
  throw new Error('not implemented');
}

/**
 * Step 2 — Mode A (Hypothesis): run the 12-question AI wizard and synthesise
 * answers into a structured ICP via Claude Sonnet 4.6.
 * Reference models: wizard_sessions, icp_definitions.
 */
export async function synthesiseIcpFromWizard(
  _workspaceId: string,
  _answers: Json,
): Promise<IcpDefinition> {
  // TODO(owner): call Claude Sonnet 4.6; produce structured output with per-field
  // confidence. If Claude is down: persist answers, queue for retry, do not block.
  throw new Error('not implemented');
}

/**
 * Step 3 — Mode B (CRM Analysis): pull closed-won/lost deals via OAuth, run a
 * statistical comparison, then interpret the patterns with Claude Sonnet 4.6.
 * Reference models: crm_analysis_jobs, icp_definitions.
 */
export async function analyseCrmDeals(
  _workspaceId: string,
  _crmType: 'hubspot' | 'salesforce',
): Promise<IcpDefinition> {
  // TODO(owner): OAuth pull → statistical win/loss comparison → Sonnet interpretation.
  // If <5 deals: route back to Mode A with a confidence warning.
  throw new Error('not implemented');
}

/**
 * Step 4 — Mode C (CSV Import): upload a CRM export, map fields, then run the
 * SAME analysis pipeline as Mode B.
 * Reference models: crm_analysis_jobs, icp_definitions.
 */
export async function analyseCsvImport(
  _workspaceId: string,
  _csvRows: Json[],
  _fieldMapping: Record<string, string>,
): Promise<IcpDefinition> {
  // TODO(owner): normalise mapped rows, then reuse the Mode B analysis pipeline.
  throw new Error('not implemented');
}

/**
 * Step 5 — Normalise any mode's output into the identical structured ICP object
 * (firmographics, technographics, signals, exclusions) with confidence per field.
 */
export function buildStructuredIcp(_raw: Json, _mode: IcpMode): IcpDefinition {
  // TODO(owner): map raw synthesis/analysis output into the IcpDefinition shape.
  throw new Error('not implemented');
}

/**
 * Step 6 — Version the ICP and persist it. Returns the saved definition.
 * Reference models: icp_definitions, icp_versions, icp_confidence_history.
 */
export async function versionAndPersistIcp(
  _workspaceId: string,
  _icp: IcpDefinition,
): Promise<IcpDefinition> {
  // TODO(owner): insert icp_definitions row, snapshot into icp_versions, append
  // icp_confidence_history. Every row carries workspaceId (RLS).
  throw new Error('not implemented');
}

/**
 * Step 7 — Apply a change to an existing ICP (manual edit or flywheel feedback),
 * bumping the version. Returns the new definition.
 * Reference models: icp_definitions, icp_versions.
 */
export async function reviseIcp(
  _workspaceId: string,
  _icpId: string,
  _changes: Partial<IcpDefinition>,
  _source: 'manual_edit' | 'flywheel_feedback',
): Promise<IcpDefinition> {
  // TODO(owner): load current, apply changes, cut a new version, record which
  // fields changed (for the icp.updated payload).
  throw new Error('not implemented');
}
