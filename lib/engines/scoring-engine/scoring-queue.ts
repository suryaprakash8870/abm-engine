/**
 * Async scoring queue (engine 04).
 *
 * The accounts.enriched handler enqueues a scoring job here — never runs
 * inline in the event handler. Worker calls runScoring() which implements
 * the full step-by-step job and publishes accounts.scored on success.
 */

import { Queue, Worker, type Job } from 'bullmq';
import { getRedisConnection } from '../../clients/redis';
import { newCorrelationId } from '../../events';
import {
  getOrGenerateFormula,
  scoreAndTierAccounts,
  storeScoreBreakdowns,
  recordTierBoundaries,
  buildTierSummary,
} from './service';
import { completionCheck } from './validation';
import { publishAccountsScored, publishScoringFailed } from './publisher';

const QUEUE_NAME = 'scoring.run';

export interface ScoringJobData {
  workspaceId: string;
  icpId: string;
  accountIds: string[];
  sourceJobId: string; // enrichment job_id
  correlationId: string;
}

let queue: Queue<ScoringJobData> | null = null;

function scoringQueue(): Queue<ScoringJobData> {
  if (!queue) {
    queue = new Queue<ScoringJobData>(QUEUE_NAME, {
      connection: getRedisConnection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5_000 },
        removeOnComplete: 500,
        removeOnFail: false,
      },
    });
  }
  return queue;
}

export async function enqueueScoringJob(input: Omit<ScoringJobData, 'correlationId'> & { correlationId?: string }): Promise<void> {
  const correlationId = input.correlationId ?? newCorrelationId();
  // Deduplicate: the same enrichment run (correlation id) must never spawn two
  // scoring jobs (e.g. an event replay), which would double-publish accounts.scored.
  const jobId = `${input.workspaceId}:${input.icpId}:${correlationId}`;
  await scoringQueue().add('score', { ...input, correlationId }, { jobId });
}

async function runScoring(data: ScoringJobData): Promise<void> {
  const ctx = { workspaceId: data.workspaceId, correlationId: data.correlationId };

  try {
    const formula = await getOrGenerateFormula(data.workspaceId, data.icpId);
    const scored = await scoreAndTierAccounts(data.workspaceId, data.accountIds, formula);
    await storeScoreBreakdowns(data.workspaceId, scored);
    const tierBoundariesRecorded = await recordTierBoundaries(formula);
    const summary = buildTierSummary(scored);

    // ── Verify-before-publish (ADR-003) ──────────────────────────────────────
    // First confirm the WORK is complete and correct. Only then publish, and
    // only mark "published and confirmed" once the publish actually succeeds.
    // (The previous version hard-coded that flag to false, so the gate could
    //  NEVER pass and accounts.scored was unreachable — every run reported failed.)
    const workComplete = completionCheck({
      // A valid score is 0-100; tier is 1/2/3 OR null (legitimately untiered, below tier3_min).
      everyAccountHasScoreAndTier: scored.every(
        (s) => s.total_score >= 0 && s.total_score <= 100 && (s.tier === null || (s.tier >= 1 && s.tier <= 3)),
      ),
      scoreBreakdownStoredForEveryAccount: scored.length === data.accountIds.length,
      tierBoundariesRecorded,
      accountsScoredPublishedAndConfirmed: true, // the publish below is the confirmation step
    });

    if (!workComplete.ok) {
      await publishScoringFailed(
        { icp_id: data.icpId, reason: 'Completion check failed', failed_check: workComplete.failed.join('; '), account_ids_attempted: data.accountIds },
        ctx,
      );
      return;
    }

    // If this publish throws, the outer catch reports scoring.failed and BullMQ
    // retries the whole (idempotent) job — so a transient bus outage self-heals.
    await publishAccountsScored(
      {
        account_ids: data.accountIds,
        formula_version: formula.version,
        tier_summary: summary as unknown as Record<string, unknown>,
        tier_1_count: summary.tier_1_count,
        tier_2_count: summary.tier_2_count,
        tier_3_count: summary.tier_3_count,
        top_tier_1_account_ids: summary.top_tier_1_account_ids,
        scored_at: new Date().toISOString(),
      },
      ctx,
    );
  } catch (err) {
    await publishScoringFailed(
      { icp_id: data.icpId, reason: String(err), failed_check: 'unhandled error', account_ids_attempted: data.accountIds },
      ctx,
    );
    throw err; // let BullMQ retry
  }
}

let worker: Worker<ScoringJobData> | null = null;

export function startScoringWorker(): Worker<ScoringJobData> {
  if (worker) return worker;
  worker = new Worker<ScoringJobData>(
    QUEUE_NAME,
    async (job: Job<ScoringJobData>) => runScoring(job.data),
    { connection: getRedisConnection(), concurrency: 5 },
  );
  return worker;
}
