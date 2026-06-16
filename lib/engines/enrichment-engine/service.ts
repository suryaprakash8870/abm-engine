/**
 * Service — the core enrichment + AI-qualification steps (engine 03).
 *
 * One exported stub per step of the doc's "Step-by-step job". Bodies are
 * intentionally unimplemented (`// TODO(owner)`); they return typed shapes or
 * throw so the module compiles under strict TS. Prisma models for this engine
 * do NOT exist yet, so they are referenced ONLY in comments.
 *
 * Owned tables (see prisma/schema/enrichment-engine.prisma):
 *   enrichment_jobs · enriched_accounts · qualification_results ·
 *   prompt_versions · enrichment_cache (SHARED across workspaces)
 *
 * @see ../../../docs/engines/engine-03-enrichment-engine.md
 */

import type { AccountId, Json } from '../../events';

const NOT_IMPLEMENTED = 'not implemented';

/** A single account's enrichment outcome (firmographic + technographic). */
export interface EnrichedAccount {
  account_id: AccountId;
  domain: string;
  name: string | null;
  industry: string | null;
  headcount: number | null;
  revenue: number | null;
  geography: string | null;
  funding_stage: string | null;
  tech_stack: string[];
  data_quality_score: number;
  enrichment_sources: string[];
}

/** Result of AI qualification for one account. */
export interface QualificationResult {
  account_id: AccountId;
  qualified: boolean;
  confidence: number;
  reason: string;
  disqualifying_factors: string[];
  /** True when confidence < 0.4 — flagged 'review recommended', never auto-disqualified. */
  review_recommended: boolean;
}

/** Aggregate counters tracked on the enrichment job. */
export interface JobProgress {
  job_id: string;
  total: number;
  enriched: number;
  failed: number;
  qualified_count: number;
  disqualified_count: number;
}

/**
 * Step 1 — open an enrichment job for a `tam.search_completed` trigger and
 * fan accounts out into batches of 25.
 *
 * Writes one `enrichment_jobs` row (status='running'); returns its id + batches.
 */
export async function startEnrichmentJob(
  _workspaceId: string,
  _sourceJobId: string,
  _accountIds: AccountId[],
): Promise<{ jobId: string; batches: AccountId[][] }> {
  // TODO(owner): insert enrichment_jobs row; chunk accountIds into batches of 25.
  throw new Error(NOT_IMPLEMENTED);
}

/**
 * Step 2 — check the enrichment cache first (30-day firmographic TTL,
 * 90-day technographic TTL). A hit means NO API call. Reads `enrichment_cache`
 * (shared across workspaces, written only by this engine).
 */
export async function checkEnrichmentCache(
  _domain: string,
): Promise<{ firmographics: Json | null; technographics: Json | null }> {
  // TODO(owner): SELECT from enrichment_cache; honour firmographic_/technographic_expires_at.
  throw new Error(NOT_IMPLEMENTED);
}

/**
 * Steps 3-4 — firmographic enrichment. Apollo first; on incomplete data fall
 * back to Clearbit (~15-20% of accounts). Persist to `enrichment_cache`
 * immediately on success.
 */
export async function enrichFirmographics(
  _domain: string,
): Promise<EnrichedAccount> {
  // TODO(owner): call Apollo enrich; if incomplete, call Clearbit; write enrichment_cache.
  throw new Error(NOT_IMPLEMENTED);
}

/**
 * Step 5 — technographic enrichment via BuiltWith, run ONLY after an ICP
 * pre-filter so we don't spend credits on accounts we'd disqualify anyway.
 */
export async function enrichTechStack(
  _domain: string,
): Promise<{ tech_stack: string[] }> {
  // TODO(owner): ICP pre-filter, then call BuiltWith; merge into enriched_accounts + cache.
  throw new Error(NOT_IMPLEMENTED);
}

/**
 * Step 6 — batch-qualify up to 50 accounts per Claude Haiku 4.5 call against the
 * locally-stored ICP definition. Uses the active prompt from `prompt_versions`.
 */
export async function qualifyAccounts(
  _accounts: EnrichedAccount[],
  _icpId: string,
): Promise<QualificationResult[]> {
  // TODO(owner): build structured Haiku prompt; classify; persist qualification_results.
  throw new Error(NOT_IMPLEMENTED);
}

/**
 * Step 7 — flag confidence < 0.4 as 'review recommended'. NEVER auto-disqualify
 * a low-confidence result.
 */
export function flagLowConfidence(
  results: QualificationResult[],
): QualificationResult[] {
  // TODO(owner): set review_recommended = confidence < 0.4 for each result.
  return results.map((r) => ({ ...r, review_recommended: r.confidence < 0.4 }));
}

/**
 * Step 8 — sample 5% of qualified AND 5% of disqualified accounts for a user
 * spot-check (feeds the /enrichment/spot-check review UI).
 */
export async function sampleForSpotCheck(
  _results: QualificationResult[],
): Promise<{ qualifiedSample: AccountId[]; disqualifiedSample: AccountId[] }> {
  // TODO(owner): draw a 5% sample from each bucket for human review.
  throw new Error(NOT_IMPLEMENTED);
}

/**
 * Step 9 (assembly) — compute the quality summary, top industries, and
 * geography breakdown for the `accounts.enriched` payload.
 */
export async function buildQualitySummary(
  _jobId: string,
): Promise<{
  quality_summary: Json;
  top_industries: string[];
  geography_breakdown: Json;
}> {
  // TODO(owner): aggregate enriched_accounts + qualification_results for the job.
  throw new Error(NOT_IMPLEMENTED);
}

/** Persist a locally-cached copy of an ICP definition (from `icp.created`) for qualification context. */
export async function storeIcpDefinition(
  _workspaceId: string,
  _icpId: string,
  _definition: Json,
): Promise<void> {
  // TODO(owner): upsert the engine-local ICP snapshot used by qualifyAccounts.
  throw new Error(NOT_IMPLEMENTED);
}

/** Read back current job progress to drive the completion check + status endpoint. */
export async function getJobProgress(_jobId: string): Promise<JobProgress> {
  // TODO(owner): SELECT counters from enrichment_jobs.
  throw new Error(NOT_IMPLEMENTED);
}
