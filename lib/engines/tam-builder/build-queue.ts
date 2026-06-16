/**
 * Async TAM build (engine 02). Like the ICP engine, the heavy paginated search is
 * queued, never run inline. Both triggers — the `icp.created` event handler and the
 * manual POST /api/v1/tam/build route — create a tam_build_job and enqueue here.
 */

import { Queue, Worker, type Job } from 'bullmq';
import { Prisma } from '@prisma/client';
import { getRedisConnection } from '../../clients/redis';
import { prisma } from '../../db/client';
import { newCorrelationId } from '../../events';
import type { ApolloSearchParams } from '../../clients/apollo';
import { runTamBuild } from './service';

const QUEUE_NAME = 'tam.build';

export interface TamBuildJobData {
  workspaceId: string;
  jobId: string;
  icpId: string;
  filters: ApolloSearchParams;
  accountLimit: number;
  correlationId: string;
}

let queue: Queue<TamBuildJobData> | null = null;

function buildQueue(): Queue<TamBuildJobData> {
  if (!queue) {
    queue = new Queue<TamBuildJobData>(QUEUE_NAME, {
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

/** Create a tam_build_job and enqueue the build. */
export async function startTamBuild(input: {
  workspaceId: string;
  icpId: string;
  filters: ApolloSearchParams;
  accountLimit?: number;
  correlationId?: string;
}): Promise<{ jobId: string; correlationId: string }> {
  const correlationId = input.correlationId ?? newCorrelationId();
  const accountLimit = input.accountLimit ?? 1000;
  const job = await prisma.tamBuildJob.create({
    data: {
      workspaceId: input.workspaceId,
      icpId: input.icpId,
      status: 'running',
      accountLimit,
      filters: input.filters as unknown as Prisma.InputJsonValue,
    },
  });
  await buildQueue().add('build', {
    workspaceId: input.workspaceId,
    jobId: job.id,
    icpId: input.icpId,
    filters: input.filters,
    accountLimit,
    correlationId,
  });
  return { jobId: job.id, correlationId };
}

/** Poll a workspace-scoped build job. */
export async function getTamJob(workspaceId: string, jobId: string) {
  return prisma.tamBuildJob.findFirst({
    where: { id: jobId, workspaceId },
    select: { id: true, icpId: true, status: true, totalFound: true, processed: true, accountLimit: true, error: true, completedAt: true },
  });
}

/** The most recent build for an ICP (used to rebuild + to surface status on the ICP page). */
export async function getLatestJobForIcp(workspaceId: string, icpId: string) {
  return prisma.tamBuildJob.findFirst({
    where: { workspaceId, icpId },
    orderBy: { startedAt: 'desc' },
    select: { id: true, status: true, totalFound: true, accountLimit: true, filters: true, completedAt: true },
  });
}

/** The raw accounts a build produced. */
export async function getRawAccounts(workspaceId: string, jobId: string, limit = 200) {
  return prisma.rawAccount.findMany({
    where: { workspaceId, jobId },
    select: { id: true, domain: true, name: true, source: true },
    take: limit,
    orderBy: { createdAt: 'asc' },
  });
}

let worker: Worker<TamBuildJobData> | null = null;

/** Start the TAM build worker. Idempotent. Called from the engine's register(). */
export function startTamBuildWorker(): Worker<TamBuildJobData> {
  if (worker) return worker;
  worker = new Worker<TamBuildJobData>(
    QUEUE_NAME,
    async (job: Job<TamBuildJobData>) => {
      await runTamBuild(job.data);
    },
    { connection: getRedisConnection(), concurrency: 2 },
  );
  return worker;
}
