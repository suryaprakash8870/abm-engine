/**
 * Async enrichment (engine 03). The per-account enrich + qualify loop is queued,
 * never run inline. The tam.search_completed handler creates an enrichment_job and
 * enqueues here.
 */

import { Queue, Worker, type Job } from 'bullmq';
import { getRedisConnection } from '../../clients/redis';
import { prisma } from '../../db/client';
import { newCorrelationId, type AccountRef } from '../../events';
import { runEnrichment } from './service';

const QUEUE_NAME = 'enrichment.run';

export interface EnrichmentJobData {
  workspaceId: string;
  jobId: string;
  sourceJobId: string;
  icpId: string;
  accounts: AccountRef[];
  correlationId: string;
}

let queue: Queue<EnrichmentJobData> | null = null;

function enrichQueue(): Queue<EnrichmentJobData> {
  if (!queue) {
    queue = new Queue<EnrichmentJobData>(QUEUE_NAME, {
      connection: getRedisConnection(),
      defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 5_000 }, removeOnComplete: 500, removeOnFail: false },
    });
  }
  return queue;
}

/** Create an enrichment_job and enqueue the run. */
export async function startEnrichment(input: {
  workspaceId: string;
  sourceJobId: string;
  icpId: string;
  accounts: AccountRef[];
  correlationId?: string;
}): Promise<{ jobId: string; correlationId: string }> {
  const correlationId = input.correlationId ?? newCorrelationId();
  const job = await prisma.enrichmentJob.create({
    data: { workspaceId: input.workspaceId, sourceJobId: input.sourceJobId, icpId: input.icpId, status: 'running', total: input.accounts.length },
  });
  await enrichQueue().add('enrich', {
    workspaceId: input.workspaceId,
    jobId: job.id,
    sourceJobId: input.sourceJobId,
    icpId: input.icpId,
    accounts: input.accounts,
    correlationId,
  });
  return { jobId: job.id, correlationId };
}

let worker: Worker<EnrichmentJobData> | null = null;

/** Start the enrichment worker. Idempotent. Called from the engine's register(). */
export function startEnrichmentWorker(): Worker<EnrichmentJobData> {
  if (worker) return worker;
  worker = new Worker<EnrichmentJobData>(
    QUEUE_NAME,
    async (job: Job<EnrichmentJobData>) => {
      await runEnrichment(job.data);
    },
    { connection: getRedisConnection(), concurrency: 2 },
  );
  return worker;
}
