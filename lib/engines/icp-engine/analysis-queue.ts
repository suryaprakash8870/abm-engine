/**
 * Async ICP analysis (Modes B & C).
 *
 * Like Mode A, the heavy work (statistics + Claude interpretation) is queued, never
 * run inline in a request. Both modes create a crm_analysis_job and enqueue here;
 * this worker runs the analysis and publishes `icp.created`.
 */

import { Queue, Worker, type Job } from 'bullmq';
import { getRedisConnection } from '../../clients/redis';
import { prisma } from '../../db/client';
import { newCorrelationId } from '../../events';
import { runDealAnalysis } from './service';
import type { Deal } from './analysis';

const QUEUE_NAME = 'icp.analysis';

export interface AnalysisJobData {
  workspaceId: string;
  jobId: string;
  mode: 'crm_analysis' | 'csv_import';
  deals: Deal[];
  correlationId: string;
}

let queue: Queue<AnalysisJobData> | null = null;

function analysisQueue(): Queue<AnalysisJobData> {
  if (!queue) {
    queue = new Queue<AnalysisJobData>(QUEUE_NAME, {
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

/** Mode B — create a CRM analysis job and enqueue it. */
export async function startCrmAnalysis(
  workspaceId: string,
  crmType: string,
  deals: Deal[],
): Promise<{ jobId: string; correlationId: string }> {
  const correlationId = newCorrelationId();
  const job = await prisma.crmAnalysisJob.create({
    data: { workspaceId, crmType, status: 'processing', dealCount: deals.length },
  });
  await analysisQueue().add('analyse', { workspaceId, jobId: job.id, mode: 'crm_analysis', deals, correlationId });
  return { jobId: job.id, correlationId };
}

/** Mode C — create a CSV-import analysis job and enqueue it. */
export async function startCsvAnalysis(
  workspaceId: string,
  deals: Deal[],
): Promise<{ jobId: string; correlationId: string }> {
  const correlationId = newCorrelationId();
  const job = await prisma.crmAnalysisJob.create({
    data: { workspaceId, crmType: 'csv', status: 'processing', dealCount: deals.length },
  });
  await analysisQueue().add('analyse', { workspaceId, jobId: job.id, mode: 'csv_import', deals, correlationId });
  return { jobId: job.id, correlationId };
}

/** Poll a workspace-scoped analysis job. */
export async function getAnalysisJob(workspaceId: string, jobId: string) {
  return prisma.crmAnalysisJob.findFirst({
    where: { id: jobId, workspaceId },
    select: { id: true, status: true, crmType: true, dealCount: true, result: true },
  });
}

let worker: Worker<AnalysisJobData> | null = null;

/** Start the analysis worker. Idempotent. Called from the engine's register(). */
export function startAnalysisWorker(): Worker<AnalysisJobData> {
  if (worker) return worker;
  worker = new Worker<AnalysisJobData>(
    QUEUE_NAME,
    async (job: Job<AnalysisJobData>) => {
      await runDealAnalysis(job.data);
    },
    { connection: getRedisConnection(), concurrency: 2 },
  );
  return worker;
}
