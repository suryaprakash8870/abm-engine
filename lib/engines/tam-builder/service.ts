/**
 * Core service for the TAM Builder (engine 02).
 *
 * Implements the doc's "Step-by-step job": take an ICP, hammer Apollo's
 * /mixed_companies/search endpoint with overlapping filter sets, paginate up to
 * the plan limit, dedupe by normalised domain, fold in any uploaded CSV, then
 * hand the assembled account-id list to the publisher.
 *
 * NO LLM usage — search/retrieval is deterministic by design (see doc).
 *
 * Prisma models this engine OWNS (referenced in comments ONLY until the owner
 * defines them in prisma/schema/tam-builder.prisma):
 *   - tam_build_jobs, apollo_search_results, raw_account_list, search_params_log
 *
 * Every function is a compiling stub: typed signature + `throw new Error('not
 * implemented')`. Fill the bodies in build order (README "Build order").
 */

import type { IcpCreatedPayload, Json } from '../../events';

const NOT_IMPLEMENTED = 'not implemented';

/** A single Apollo search-filter combination (overlapping sets maximise coverage). */
export interface ApolloSearchParams {
  industries?: string[];
  headcountRanges?: string[];
  locations?: string[];
  fundingStages?: string[];
  revenueRanges?: string[];
  /** Free-form passthrough for any extra Apollo filter keys. */
  extra?: Json;
}

/** A normalised account row destined for `raw_account_list`. */
export interface RawAccount {
  domain: string;
  name: string;
  apolloId: string | null;
  source: 'apollo' | 'csv_upload';
}

/** Per-source counts, surfaced in the success payload's `source_breakdown`. */
export interface SourceBreakdown {
  apollo: number;
  csv_upload: number;
}

/**
 * Step 1 — Receive `icp.created` and extract firmographic criteria
 * (industry, headcount, geography, funding stage, revenue).
 */
export function extractFirmographics(payload: IcpCreatedPayload): ApolloSearchParams {
  // TODO(owner): read payload.firmographics and project it onto ApolloSearchParams.
  void payload;
  throw new Error(NOT_IMPLEMENTED);
}

/**
 * Step 2 — Map ICP criteria to Apollo API filter parameters.
 * Step 3 — Produce 2-3 overlapping parameter combinations to maximise coverage.
 */
export function buildSearchParamSets(base: ApolloSearchParams): ApolloSearchParams[] {
  // TODO(owner): derive 2-3 overlapping Apollo filter sets; log each to search_params_log.
  void base;
  throw new Error(NOT_IMPLEMENTED);
}

/**
 * Step 4 — Run a search and paginate up to the workspace account limit
 * (250 / 2,500 / 10,000 by plan). Persists each page to `apollo_search_results`.
 * On Apollo 429 BullMQ backs off; on 402 surface a plan-upgrade prompt.
 */
export async function runApolloSearch(
  jobId: string,
  params: ApolloSearchParams,
  accountLimit: number,
): Promise<RawAccount[]> {
  // TODO(owner): call Apollo /mixed_companies/search, paginate, checkpoint per page.
  void jobId;
  void params;
  void accountLimit;
  throw new Error(NOT_IMPLEMENTED);
}

/**
 * Step 5 — Merge results across all searches and deduplicate by normalised domain.
 */
export function mergeAndDedupe(batches: RawAccount[][]): RawAccount[] {
  // TODO(owner): flatten, normalise domains, drop dupes (workspace_id + domain UNIQUE).
  void batches;
  throw new Error(NOT_IMPLEMENTED);
}

/**
 * Step 6 — Merge any user-uploaded account list (CSV) into the raw list.
 */
export function mergeUploadedAccounts(
  base: RawAccount[],
  uploaded: RawAccount[],
): RawAccount[] {
  // TODO(owner): union with the CSV upload, re-running domain dedupe.
  void base;
  void uploaded;
  throw new Error(NOT_IMPLEMENTED);
}

/**
 * Persist the final, deduped account list to `raw_account_list` and return the
 * generated account ids (these become `account_ids` in the success payload).
 */
export async function persistRawAccounts(
  jobId: string,
  workspaceId: string,
  accounts: RawAccount[],
): Promise<string[]> {
  // TODO(owner): bulk-insert into raw_account_list scoped by workspaceId; return ids.
  void jobId;
  void workspaceId;
  void accounts;
  throw new Error(NOT_IMPLEMENTED);
}

/**
 * Create the `tam_build_jobs` row for a run and return its id.
 */
export async function createBuildJob(
  workspaceId: string,
  icpId: string,
  accountLimit: number,
): Promise<string> {
  // TODO(owner): insert tam_build_jobs (status='running', total_found=0, processed=0).
  void workspaceId;
  void icpId;
  void accountLimit;
  throw new Error(NOT_IMPLEMENTED);
}

/**
 * Step 8 — Stream live progress to the UI via Server-Sent Events.
 * Updates `tam_build_jobs.processed`/`total_found` and pushes to the SSE channel.
 */
export async function streamProgress(
  jobId: string,
  processed: number,
  totalFound: number,
): Promise<void> {
  // TODO(owner): update tam_build_jobs counters and emit an SSE progress frame.
  void jobId;
  void processed;
  void totalFound;
  throw new Error(NOT_IMPLEMENTED);
}

/** Compute the per-source breakdown for the success payload. */
export function summariseSources(accounts: RawAccount[]): SourceBreakdown {
  // TODO(owner): tally accounts by `source`.
  void accounts;
  throw new Error(NOT_IMPLEMENTED);
}
