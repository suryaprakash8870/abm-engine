/**
 * Core service for the Scoring Engine (engine 04).
 *
 * Step-by-step job:
 *   1. getOrGenerateFormula   — fetch active formula or generate via Claude Sonnet
 *   2. scoreAccounts          — weighted sum per-criterion (1.0 / 0.5 / 0.0)
 *   3. assignTiers            — Tier 1 ≥70 / Tier 2 ≥40 / Tier 3 ≥10
 *   4. storeScoreBreakdowns   — UPSERT account_scores + append score_history
 *   5. applyTierOverride      — user override always wins, logged
 *   6. buildTierSummary       — counts + top Tier 1 ids for the event payload
 *
 * @see ../../../docs/engines/engine-04-scoring-engine.md
 */

import { Prisma } from '@prisma/client';
import { prisma } from '../../db/client';
import { anthropic, MODELS } from '../../clients/anthropic';
import type { AccountId, Tier } from '../../events';
import {
  FORMULA_TOOL,
  FORMULA_TOOL_NAME,
  FORMULA_SYSTEM_PROMPT,
  buildFormulaPrompt,
} from './prompts';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ScoringCriterion {
  key: string;
  label: string;
  weight: number; // 0-1, all weights sum to 1
  rationale: string;
}

export interface ScoringFormula {
  id: string;
  icp_id: string;
  version: number;
  criteria: ScoringCriterion[];
  tier_boundaries: { tier1_min: number; tier2_min: number; tier3_min: number };
  is_fallback: boolean;
}

export interface CriterionScore {
  key: string;
  match: 0 | 0.5 | 1;
  weight: number;
  contribution: number; // match * weight * 100
}

export interface ScoredAccount {
  account_id: AccountId;
  total_score: number; // 0-100
  tier: Tier | null; // null = scored but below tier3_min (untiered, not in the TAL)
  criterion_scores: CriterionScore[];
  formula_version: number;
}

export interface TierSummary {
  tier_1_count: number;
  tier_2_count: number;
  tier_3_count: number;
  top_tier_1_account_ids: AccountId[];
}

// ── Default formula (Claude fallback) ─────────────────────────────────────────

const DEFAULT_CRITERIA: ScoringCriterion[] = [
  { key: 'industry_fit',   label: 'Industry fit',     weight: 0.30, rationale: 'Equal-weight fallback — replace with AI-generated formula.' },
  { key: 'company_size',   label: 'Company size',     weight: 0.25, rationale: 'Equal-weight fallback.' },
  { key: 'tech_stack',     label: 'Tech stack match', weight: 0.25, rationale: 'Equal-weight fallback.' },
  { key: 'buying_signals', label: 'Buying signals',   weight: 0.20, rationale: 'Equal-weight fallback.' },
];

const DEFAULT_BOUNDARIES = { tier1_min: 70, tier2_min: 40, tier3_min: 10 };

// ── Formula generation ─────────────────────────────────────────────────────────

async function generateFormulaViaClaude(icp: {
  firmographics: Record<string, unknown>;
  technographics: Record<string, unknown>;
  signals: Record<string, unknown>;
  exclusions: Record<string, unknown>;
}): Promise<ScoringCriterion[]> {
  const resp = await anthropic().messages.create({
    model: MODELS.reasoning,
    max_tokens: 1500,
    system: FORMULA_SYSTEM_PROMPT,
    tools: [FORMULA_TOOL],
    tool_choice: { type: 'tool', name: FORMULA_TOOL_NAME },
    messages: [{ role: 'user', content: buildFormulaPrompt(icp) }],
  });

  const toolUse = resp.content.find((b) => b.type === 'tool_use');
  if (!toolUse || toolUse.type !== 'tool_use') {
    throw new Error('Claude did not return a scoring formula tool call');
  }

  const raw = (toolUse.input as { criteria?: unknown }).criteria;
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error('Claude returned an empty criteria array');
  }

  const criteria = raw as ScoringCriterion[];

  // Normalise weights so they always sum to exactly 1.
  const total = criteria.reduce((s, c) => s + c.weight, 0);
  if (total > 0) criteria.forEach((c) => (c.weight = c.weight / total));

  return criteria;
}

/**
 * Step 1 — fetch active formula for this ICP or generate via Claude Sonnet.
 * On generation failure, falls back to equal-weight default (never blocks pipeline).
 */
export async function getOrGenerateFormula(
  workspaceId: string,
  icpId: string,
): Promise<ScoringFormula> {
  // Return the most recent formula for this ICP if one exists.
  const existing = await prisma.scoringFormula.findFirst({
    where: { workspaceId, icpId },
    orderBy: { version: 'desc' },
  });
  if (existing) {
    return {
      id: existing.id,
      icp_id: existing.icpId,
      version: existing.version,
      criteria: existing.criteria as unknown as ScoringCriterion[],
      tier_boundaries: existing.tierBoundaries as unknown as ScoringFormula['tier_boundaries'],
      is_fallback: existing.isFallback,
    };
  }

  // Load the ICP from the icp_definitions table (local read — engine 01 owns it,
  // but we need to generate the formula. We read the public table, not an event copy,
  // because this is a deliberate user-triggered action, not a background pipeline step.)
  const icpRow = await prisma.icpDefinition.findFirst({ where: { id: icpId, workspaceId } });

  let criteria = DEFAULT_CRITERIA;
  let isFallback = true;

  if (icpRow) {
    try {
      criteria = await generateFormulaViaClaude({
        firmographics: icpRow.firmographics as Record<string, unknown>,
        technographics: icpRow.technographics as Record<string, unknown>,
        signals: icpRow.signals as Record<string, unknown>,
        exclusions: icpRow.exclusions as Record<string, unknown>,
      });
      isFallback = false;
    } catch (err) {
      console.warn(
        JSON.stringify({ level: 'warn', engine: 'scoring-engine', msg: 'Claude formula generation failed, using fallback', err: String(err) }),
      );
    }
  }

  const row = await prisma.scoringFormula.create({
    data: {
      workspaceId,
      icpId,
      version: 1,
      criteria: criteria as unknown as Prisma.InputJsonValue,
      tierBoundaries: DEFAULT_BOUNDARIES as unknown as Prisma.InputJsonValue,
      isFallback,
      createdBy: 'system',
    },
  });

  await prisma.scoringFormulaVersion.create({
    data: {
      workspaceId,
      formulaId: row.id,
      versionNumber: 1,
      snapshot: { criteria, tierBoundaries: DEFAULT_BOUNDARIES } as unknown as Prisma.InputJsonValue,
    },
  });

  return {
    id: row.id,
    icp_id: icpId,
    version: 1,
    criteria,
    tier_boundaries: DEFAULT_BOUNDARIES,
    is_fallback: isFallback,
  };
}

// ── Scoring ────────────────────────────────────────────────────────────────────

/**
 * Evaluate a single account against one criterion.
 * Reads enriched_accounts for headcount/industry/tech_stack fields.
 */
function scoreOneCriterion(
  key: string,
  weight: number,
  account: {
    industry: string | null;
    headcount: number | null;
    techStack: string[];
    qualified: boolean | null;
  },
  icp: {
    firmographics: Record<string, unknown>;
    technographics: Record<string, unknown>;
  },
): CriterionScore {
  let match: 0 | 0.5 | 1 = 0;

  const strArr = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  const num = (v: unknown, d: number): number =>
    typeof v === 'number' && Number.isFinite(v) ? v : d;

  if (key === 'industry_fit') {
    const industries = strArr(icp.firmographics.industries).map((s) => s.toLowerCase());
    if (account.industry) {
      const ind = account.industry.toLowerCase();
      if (industries.some((i) => ind.includes(i) || i.includes(ind))) match = 1;
      else match = 0;
    }
  } else if (key === 'company_size') {
    const min = num(icp.firmographics.employee_min, 0);
    const max = num(icp.firmographics.employee_max, Infinity);
    if (account.headcount != null) {
      if (account.headcount >= min && account.headcount <= max) match = 1;
      else if (account.headcount >= min * 0.5 && account.headcount <= max * 2) match = 0.5;
      else match = 0;
    }
  } else if (key === 'tech_stack') {
    const required = strArr(icp.technographics.required).map((s) => s.toLowerCase());
    const preferred = strArr(icp.technographics.preferred).map((s) => s.toLowerCase());
    const acctStack = account.techStack.map((s) => s.toLowerCase());
    const hasRequired = required.length === 0 || required.some((t) => acctStack.includes(t));
    const hasPreferred = preferred.some((t) => acctStack.includes(t));
    match = hasRequired && hasPreferred ? 1 : hasRequired ? 0.5 : 0;
  } else if (key === 'buying_signals') {
    // Placeholder — signal engine (07) owns real signal data. Use qualification score proxy.
    match = account.qualified === true ? 0.5 : 0;
  } else {
    // AI-generated criterion key we don't have a hard-coded evaluator for.
    // Use the qualified flag as a proxy until signal data is available.
    match = account.qualified === true ? 0.5 : 0;
  }

  // Guard against a malformed weight (e.g. from a hand-edited formula) that would
  // otherwise propagate NaN through the total score.
  const w = Number.isFinite(weight) ? weight : 0;
  return { key, match, weight: w, contribution: Math.round(match * w * 100 * 10) / 10 };
}

/**
 * Step 2+3 — score every account and assign tiers in one pass.
 * Reads enriched_accounts for each account_id.
 */
export async function scoreAndTierAccounts(
  workspaceId: string,
  accountIds: AccountId[],
  formula: ScoringFormula,
): Promise<ScoredAccount[]> {
  if (accountIds.length === 0) return [];

  const rows = await prisma.enrichedAccount.findMany({
    where: { workspaceId, id: { in: accountIds } },
    select: { id: true, accountId: true, industry: true, headcount: true, techStack: true },
  });

  // Pull qualification results separately (they live in qualification_results table)
  const quals = await prisma.qualificationResult.findMany({
    where: { workspaceId, accountId: { in: rows.map((r) => r.accountId) } },
    select: { accountId: true, qualified: true },
  });
  const qualMap = new Map(quals.map((q) => [q.accountId, q.qualified]));

  const rowMap = new Map(rows.map((r) => [r.id, { ...r, qualified: qualMap.get(r.accountId) ?? null }]));

  // Load the SAME ICP the formula was generated from — not just "an" ICP in the
  // workspace. Without the id filter a workspace with multiple ICPs would score
  // against an arbitrary one and silently produce wrong results.
  const icpRow = await prisma.icpDefinition.findFirst({
    where: { workspaceId, id: formula.icp_id },
    orderBy: { createdAt: 'desc' },
  });
  if (!icpRow) {
    throw new Error(`[scoring-engine] ICP ${formula.icp_id} not found for workspace — cannot score accounts`);
  }
  const icpFirm = (icpRow.firmographics ?? {}) as Record<string, unknown>;
  const icpTech = (icpRow.technographics ?? {}) as Record<string, unknown>;

  // "User override always wins" (doc failure-handling). Load the LATEST override
  // per account so a re-score honours it instead of silently reverting to the
  // formula tier. tier_overrides is an append log → newest row per account wins.
  const overrideRows = await prisma.tierOverride.findMany({
    where: { workspaceId, accountId: { in: accountIds } },
    orderBy: { overriddenAt: 'desc' },
    select: { accountId: true, tier: true },
  });
  const overrideMap = new Map<string, Tier>();
  for (const o of overrideRows) {
    if (!overrideMap.has(o.accountId)) overrideMap.set(o.accountId, o.tier as Tier);
  }

  const { tier_boundaries: b } = formula;

  return accountIds.map((accountId) => {
    const account = rowMap.get(accountId) ?? {
      id: accountId,
      industry: null,
      headcount: null,
      techStack: [],
      qualified: null,
    };

    const criterion_scores = formula.criteria.map((c) =>
      scoreOneCriterion(c.key, c.weight, {
        industry: account.industry,
        headcount: account.headcount,
        techStack: account.techStack ?? [],
        qualified: account.qualified,
      }, { firmographics: icpFirm, technographics: icpTech }),
    );

    const total_score = Math.min(
      100,
      Math.round(criterion_scores.reduce((s, c) => s + c.contribution, 0)),
    );

    // Honour the tier3_min floor: an account below it is scored but untiered
    // (null) — it does NOT belong in any tier / the TAL. Previously these were
    // silently mislabelled Tier 3.
    const formulaTier: Tier | null =
      total_score >= b.tier1_min ? 1
      : total_score >= b.tier2_min ? 2
      : total_score >= b.tier3_min ? 3
      : null;

    // A manual override wins over the formula tier (and can promote an otherwise
    // untiered account onto the TAL).
    const tier: Tier | null = overrideMap.get(accountId) ?? formulaTier;

    return { account_id: accountId, total_score, tier, criterion_scores, formula_version: formula.version };
  });
}

// ── Persistence ────────────────────────────────────────────────────────────────

/** Step 4 — UPSERT account_scores + append score_history rows. */
export async function storeScoreBreakdowns(
  workspaceId: string,
  scored: ScoredAccount[],
): Promise<void> {
  await prisma.$transaction([
    ...scored.map((s) =>
      prisma.accountScore.upsert({
        where: { workspaceId_accountId: { workspaceId, accountId: s.account_id } },
        create: {
          workspaceId,
          accountId: s.account_id,
          formulaVersion: s.formula_version,
          totalScore: s.total_score,
          tier: s.tier,
          criterionScores: s.criterion_scores as unknown as Prisma.InputJsonValue,
        },
        update: {
          formulaVersion: s.formula_version,
          totalScore: s.total_score,
          tier: s.tier,
          criterionScores: s.criterion_scores as unknown as Prisma.InputJsonValue,
          scoredAt: new Date(),
        },
      }),
    ),
    ...scored.map((s) =>
      prisma.scoreHistory.create({
        data: {
          workspaceId,
          accountId: s.account_id,
          score: s.total_score,
          tier: s.tier,
        },
      }),
    ),
  ]);
}

/**
 * Apply tier boundaries back to the formula version snapshot.
 * Returns true only if a snapshot row was actually updated — the completion
 * check relies on this to confirm the boundaries were persisted (verify-before-publish).
 */
export async function recordTierBoundaries(formula: ScoringFormula): Promise<boolean> {
  const result = await prisma.scoringFormulaVersion.updateMany({
    where: { formulaId: formula.id, versionNumber: formula.version },
    data: {
      snapshot: {
        criteria: formula.criteria,
        tierBoundaries: formula.tier_boundaries,
      } as unknown as Prisma.InputJsonValue,
    },
  });
  return result.count > 0;
}

/** Step 6 — build the tier summary for the accounts.scored payload. */
export function buildTierSummary(scored: ScoredAccount[]): TierSummary {
  const t1 = scored.filter((s) => s.tier === 1);
  const t2 = scored.filter((s) => s.tier === 2);
  const t3 = scored.filter((s) => s.tier === 3);
  return {
    tier_1_count: t1.length,
    tier_2_count: t2.length,
    tier_3_count: t3.length,
    top_tier_1_account_ids: t1
      .sort((a, b) => b.total_score - a.total_score)
      .slice(0, 20)
      .map((s) => s.account_id),
  };
}

// ── Formula editing ────────────────────────────────────────────────────────────

/**
 * Validate + normalise a user-supplied criteria array. The PUT endpoint accepts
 * arbitrary JSON; without this a missing/NaN weight flows straight into scoring
 * and produces NaN contributions. Throws on a structurally invalid array.
 * Returns weights normalised to sum to exactly 1.
 */
function normaliseCriteria(input: unknown): ScoringCriterion[] {
  if (!Array.isArray(input) || input.length === 0) {
    throw new Error('Invalid formula: criteria must be a non-empty array');
  }
  const cleaned = input.map((raw, i) => {
    const c = raw as Partial<ScoringCriterion>;
    if (typeof c.key !== 'string' || c.key.length === 0) {
      throw new Error(`Invalid formula: criteria[${i}].key must be a non-empty string`);
    }
    if (typeof c.weight !== 'number' || !Number.isFinite(c.weight) || c.weight < 0) {
      throw new Error(`Invalid formula: criteria[${i}].weight must be a finite number ≥ 0`);
    }
    return {
      key: c.key,
      label: typeof c.label === 'string' && c.label.length > 0 ? c.label : c.key,
      weight: c.weight,
      rationale: typeof c.rationale === 'string' ? c.rationale : '',
    };
  });
  const total = cleaned.reduce((s, c) => s + c.weight, 0);
  if (total <= 0) throw new Error('Invalid formula: criteria weights must sum to a positive number');
  cleaned.forEach((c) => (c.weight = c.weight / total));
  return cleaned;
}

/** Validate user-supplied tier boundaries (must be strictly descending, finite). */
function validateBoundaries(input: unknown): ScoringFormula['tier_boundaries'] {
  const b = input as Partial<ScoringFormula['tier_boundaries']>;
  const fields: Array<keyof ScoringFormula['tier_boundaries']> = ['tier1_min', 'tier2_min', 'tier3_min'];
  for (const f of fields) {
    if (typeof b[f] !== 'number' || !Number.isFinite(b[f])) {
      throw new Error(`Invalid formula: tier_boundaries.${f} must be a finite number`);
    }
  }
  if (!(b.tier1_min! > b.tier2_min! && b.tier2_min! > b.tier3_min! && b.tier3_min! >= 0)) {
    throw new Error('Invalid formula: tier boundaries must be strictly descending and ≥ 0 (tier1_min > tier2_min > tier3_min ≥ 0)');
  }
  return { tier1_min: b.tier1_min!, tier2_min: b.tier2_min!, tier3_min: b.tier3_min! };
}

/** Update formula weights/boundaries and cut a new version. */
export async function updateFormula(
  workspaceId: string,
  formulaId: string,
  changes: { criteria?: ScoringCriterion[]; tier_boundaries?: ScoringFormula['tier_boundaries'] },
): Promise<ScoringFormula> {
  const existing = await prisma.scoringFormula.findFirst({
    where: { id: formulaId, workspaceId },
  });
  if (!existing) throw new Error('Formula not found');

  const newVersion = existing.version + 1;
  const criteria = changes.criteria !== undefined
    ? normaliseCriteria(changes.criteria)
    : (existing.criteria as unknown as ScoringCriterion[]);
  const tierBoundaries = changes.tier_boundaries !== undefined
    ? validateBoundaries(changes.tier_boundaries)
    : (existing.tierBoundaries as unknown as ScoringFormula['tier_boundaries']);

  const updated = await prisma.scoringFormula.update({
    where: { id: formulaId },
    data: {
      version: newVersion,
      criteria: criteria as unknown as Prisma.InputJsonValue,
      tierBoundaries: tierBoundaries as unknown as Prisma.InputJsonValue,
      isFallback: false,
    },
  });

  await prisma.scoringFormulaVersion.create({
    data: {
      workspaceId,
      formulaId,
      versionNumber: newVersion,
      snapshot: { criteria, tierBoundaries } as unknown as Prisma.InputJsonValue,
    },
  });

  return {
    id: updated.id,
    icp_id: updated.icpId,
    version: newVersion,
    criteria,
    tier_boundaries: tierBoundaries,
    is_fallback: false,
  };
}

// ── Override ───────────────────────────────────────────────────────────────────

/** Manual tier override — user override always wins, logged for formula improvement. */
export async function applyTierOverride(
  workspaceId: string,
  accountId: AccountId,
  tier: Tier,
  reason: string,
  overriddenBy: string,
): Promise<void> {
  if (!reason.trim()) throw new Error('Reason is required for a tier override.');

  await prisma.$transaction([
    prisma.tierOverride.create({
      data: { workspaceId, accountId, tier, reason, overriddenBy },
    }),
    prisma.accountScore.updateMany({
      where: { workspaceId, accountId },
      data: { tier },
    }),
  ]);
}

// ── Distribution ───────────────────────────────────────────────────────────────

export async function getTierDistribution(workspaceId: string) {
  const [scores, overrides] = await Promise.all([
    prisma.accountScore.groupBy({
      by: ['tier'],
      where: { workspaceId },
      _count: { tier: true },
    }),
    prisma.tierOverride.count({ where: { workspaceId } }),
  ]);

  const counts = { tier_1: 0, tier_2: 0, tier_3: 0 };
  for (const row of scores) {
    if (row.tier === 1) counts.tier_1 = row._count.tier;
    else if (row.tier === 2) counts.tier_2 = row._count.tier;
    else if (row.tier === 3) counts.tier_3 = row._count.tier;
  }
  return { ...counts, total: counts.tier_1 + counts.tier_2 + counts.tier_3, override_count: overrides };
}
