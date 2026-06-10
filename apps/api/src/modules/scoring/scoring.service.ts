import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';
import { accounts, createDb, icpRubrics, scores } from '@abm/db';
import type { Tier } from '@abm/shared';
import { DB_TOKEN } from '../../common/db/db.module';

type DbHandle = ReturnType<typeof createDb>;

/**
 * Phase 1 scoring — rules-based, no ML (see ADR-013). Reads the org's active
 * `icp_rubrics` row, applies it to each account, persists fitScore + tier into
 * `scores`. ML deferred until rules are proven insufficient at the Phase 2
 * validation gate.
 *
 * The `breakdown` is computed but NOT persisted in Phase 1 — it's recomputed
 * on-demand for the account-detail page, so rubric edits don't require
 * backfilling. Cheap because scoring is pure deterministic arithmetic.
 */
@Injectable()
export class ScoringService {
  private readonly logger = new Logger(ScoringService.name);

  constructor(@Inject(DB_TOKEN) private readonly dbHandle: DbHandle) {}

  // ── Public API ────────────────────────────────────────────────────────

  /**
   * Score every account belonging to `orgId` using the org's active rubric.
   * Idempotent: re-running produces the same numbers and upserts via
   * (org_id, account_id) unique key.
   *
   * `onProgress` is called with {current, total} as each account is scored —
   * used by CrmSyncService to forward a smooth progress bar to the UI.
   */
  async scoreAccountsForOrg(
    orgId: string,
    onProgress?: (p: { current: number; total: number }) => Promise<void> | void,
  ): Promise<{
    scored: number;
    skippedNoRubric: boolean;
  }> {
    const rubric = await this.getActiveRubric(orgId);
    if (!rubric) {
      this.logger.warn(`No icp_rubric found for org=${orgId} — skipping scoring`);
      return { scored: 0, skippedNoRubric: true };
    }

    const orgAccounts = await this.dbHandle.db
      .select()
      .from(accounts)
      .where(eq(accounts.orgId, orgId));

    const total = orgAccounts.length;
    let scored = 0;
    for (const account of orgAccounts) {
      const result = applyRubric(account, rubric);
      await this.dbHandle.db
        .insert(scores)
        .values({
          orgId,
          accountId: account.id,
          fitScore: result.fitScore,
          tier: result.tier,
          computedAt: sql`now()`,
        })
        .onConflictDoUpdate({
          target: [scores.orgId, scores.accountId],
          set: {
            fitScore: result.fitScore,
            tier: result.tier,
            computedAt: sql`now()`,
          },
        });
      scored += 1;
      // Emit progress every row — cheap, and BullMQ batches writes internally.
      if (onProgress) {
        try {
          await onProgress({ current: scored, total });
        } catch {
          // Progress is best-effort.
        }
      }
    }

    this.logger.log(`Scored ${scored} accounts for org=${orgId} (rubric v${rubric.version})`);
    return { scored, skippedNoRubric: false };
  }

  /**
   * Score and persist ONE account — used after enrichment lands so techno/
   * firmographic fills are reflected without re-scoring the whole org.
   */
  async scoreAccount(orgId: string, accountId: string): Promise<ScoringResult | null> {
    const rubric = await this.getActiveRubric(orgId);
    if (!rubric) return null;

    const [account] = await this.dbHandle.db
      .select()
      .from(accounts)
      .where(and(eq(accounts.orgId, orgId), eq(accounts.id, accountId)))
      .limit(1);
    if (!account) return null;

    const result = applyRubric(account, rubric);
    await this.dbHandle.db
      .insert(scores)
      .values({
        orgId,
        accountId,
        fitScore: result.fitScore,
        tier: result.tier,
        computedAt: sql`now()`,
      })
      .onConflictDoUpdate({
        target: [scores.orgId, scores.accountId],
        set: { fitScore: result.fitScore, tier: result.tier, computedAt: sql`now()` },
      });
    return result;
  }

  /** Active rubric row (highest version) — powers the rubric editor API. */
  async getActiveRubricRow(orgId: string) {
    const [row] = await this.dbHandle.db
      .select()
      .from(icpRubrics)
      .where(eq(icpRubrics.orgId, orgId))
      .orderBy(desc(icpRubrics.version))
      .limit(1);
    return row ?? null;
  }

  /**
   * Save an edited rubric as a NEW version (append-only — old versions stay
   * for auditability), then re-score the whole org against it.
   */
  async saveRubricVersion(orgId: string, name: string, weights: Record<string, unknown>) {
    const current = await this.getActiveRubricRow(orgId);
    const nextVersion = (current?.version ?? 0) + 1;
    const [row] = await this.dbHandle.db
      .insert(icpRubrics)
      .values({ orgId, version: nextVersion, name, weights })
      .returning();
    const rescore = await this.scoreAccountsForOrg(orgId);
    return { rubric: row, rescored: rescore.scored };
  }

  /**
   * Compute score + breakdown for a single account on demand (for the
   * account-detail page). Does NOT persist — caller uses this for display.
   */
  async explainAccount(orgId: string, accountId: string): Promise<ScoringResult | null> {
    const rubric = await this.getActiveRubric(orgId);
    if (!rubric) return null;

    const [account] = await this.dbHandle.db
      .select()
      .from(accounts)
      .where(and(eq(accounts.orgId, orgId), eq(accounts.id, accountId)))
      .limit(1);
    if (!account) return null;

    return applyRubric(account, rubric);
  }

  // ── Internals ─────────────────────────────────────────────────────────

  private async getActiveRubric(orgId: string): Promise<RubricV1 | null> {
    const [row] = await this.dbHandle.db
      .select()
      .from(icpRubrics)
      .where(eq(icpRubrics.orgId, orgId))
      .orderBy(desc(icpRubrics.version))
      .limit(1);
    if (!row) return null;
    // Trust the seed migration's shape; in Phase 2 we add a Zod parser.
    return row.weights as unknown as RubricV1;
  }
}

// ── Rubric shape + pure scoring function ────────────────────────────────

export interface RubricV1 {
  version: number;
  industry: Record<string, number>;
  industryDefault: number;
  consumerIndustries: string[];
  industryConsumerPoints: number;
  industryMissing: number;
  employeesBands: Array<{ min: number; max: number; points: number }>;
  employeesDefault: number;
  country: Record<string, number>;
  countryDefault: number;
  countryMissing: number;
  crmProvider: Record<string, number>;
  crmProviderDefault: number;
  hasWebsitePoints: number;
  hasWebsiteMissingPoints: number;
  /**
   * Optional technographics (Playbook Step 2). Keys are tool names matched
   * case-insensitively against `enrichment.technologies` (string[] filled by
   * the Enrichment job). Absent on pre-existing rubrics → 0 points, no error.
   */
  technologies?: Record<string, number>;
  tierThresholds: { tier1: number; tier2: number; tier3: number };
}

export interface ScoringResult {
  fitScore: number;
  tier: Tier | null;
  breakdown: Breakdown[];
}

export interface Breakdown {
  field: string;
  value: string | number | null;
  points: number;
  reason: string;
}

type AccountRow = typeof accounts.$inferSelect;

/**
 * Pure function — exported for testing and on-demand explain. No I/O.
 *
 * Applies each rubric field to an account, building up a breakdown so the
 * UI can show "Industry +25, Employees +0, ..." instead of a bare number
 * (UI_FLOW design principle #1: always explain the score).
 */
export function applyRubric(account: AccountRow, rubric: RubricV1): ScoringResult {
  const enrichment = (account.enrichment ?? {}) as Record<string, unknown>;
  const breakdown: Breakdown[] = [];

  // Industry
  const industry = readString(enrichment, 'industry');
  let industryPoints: number;
  let industryReason: string;
  if (!industry) {
    industryPoints = rubric.industryMissing;
    industryReason = 'industry unknown';
  } else if (rubric.industry[industry] !== undefined) {
    industryPoints = rubric.industry[industry]!;
    industryReason = `industry "${industry}" is a target ICP segment`;
  } else if (rubric.consumerIndustries.includes(industry)) {
    industryPoints = rubric.industryConsumerPoints;
    industryReason = `industry "${industry}" is consumer / non-target`;
  } else {
    industryPoints = rubric.industryDefault;
    industryReason = `industry "${industry}" is adjacent B2B`;
  }
  breakdown.push({ field: 'industry', value: industry, points: industryPoints, reason: industryReason });

  // Employees
  const employees = readNumber(enrichment, 'numberofemployees');
  let employeesPoints = rubric.employeesDefault;
  let employeesReason = employees === null ? 'employee count unknown' : `${employees} employees — outside target bands`;
  if (employees !== null) {
    for (const band of rubric.employeesBands) {
      if (employees >= band.min && employees <= band.max) {
        employeesPoints = band.points;
        employeesReason = `${employees} employees — band ${band.min}–${band.max}`;
        break;
      }
    }
  }
  breakdown.push({ field: 'employees', value: employees, points: employeesPoints, reason: employeesReason });

  // Country
  const country = readString(enrichment, 'country');
  let countryPoints: number;
  let countryReason: string;
  if (!country) {
    countryPoints = rubric.countryMissing;
    countryReason = 'country unknown';
  } else if (rubric.country[country] !== undefined) {
    countryPoints = rubric.country[country]!;
    countryReason = `${country} is a target market`;
  } else {
    countryPoints = rubric.countryDefault;
    countryReason = `${country} is outside target markets`;
  }
  breakdown.push({ field: 'country', value: country, points: countryPoints, reason: countryReason });

  // CRM provider
  const crm = account.externalCrmProvider;
  let crmPoints = rubric.crmProviderDefault;
  let crmReason = crm ? `CRM is ${crm} (not in target list)` : 'no CRM connected';
  if (crm && rubric.crmProvider[crm] !== undefined) {
    crmPoints = rubric.crmProvider[crm]!;
    crmReason = `connected via ${crm} — we integrate today`;
  }
  breakdown.push({ field: 'crmProvider', value: crm, points: crmPoints, reason: crmReason });

  // Has website (presence-only proxy for "real company")
  const website = readString(enrichment, 'website');
  const websitePoints = website ? rubric.hasWebsitePoints : rubric.hasWebsiteMissingPoints;
  breakdown.push({
    field: 'hasWebsite',
    value: website,
    points: websitePoints,
    reason: website ? 'has a website' : 'no website on record',
  });

  // Technographics (optional — only when the rubric weights tools AND
  // enrichment has run). Sum of matched tool weights.
  if (rubric.technologies && Object.keys(rubric.technologies).length > 0) {
    const stack = Array.isArray(enrichment.technologies)
      ? (enrichment.technologies as unknown[]).filter((t): t is string => typeof t === 'string')
      : [];
    const stackLower = new Set(stack.map((t) => t.toLowerCase()));
    let techPoints = 0;
    const matched: string[] = [];
    for (const [tool, points] of Object.entries(rubric.technologies)) {
      if (stackLower.has(tool.toLowerCase())) {
        techPoints += points;
        matched.push(tool);
      }
    }
    breakdown.push({
      field: 'technologies',
      value: matched.length > 0 ? matched.join(', ') : stack.length > 0 ? '(no target tools)' : null,
      points: techPoints,
      reason:
        matched.length > 0
          ? `uses target tools: ${matched.join(', ')}`
          : stack.length > 0
            ? 'tech stack known but no target tools found'
            : 'tech stack unknown (not yet enriched)',
    });
  }

  const fitScore = breakdown.reduce((s, b) => s + b.points, 0);
  const tier = scoreToTier(fitScore, rubric.tierThresholds);

  return { fitScore, tier, breakdown };
}

function scoreToTier(score: number, t: RubricV1['tierThresholds']): Tier | null {
  if (score >= t.tier1) return 1;
  if (score >= t.tier2) return 2;
  if (score >= t.tier3) return 3;
  return null; // "Drop" — below cutoff
}

function readString(obj: Record<string, unknown>, key: string): string | null {
  const v = obj[key];
  return typeof v === 'string' && v.trim().length > 0 ? v : null;
}

function readNumber(obj: Record<string, unknown>, key: string): number | null {
  const v = obj[key];
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim().length > 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}
