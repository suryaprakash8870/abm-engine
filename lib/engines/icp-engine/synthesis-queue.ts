/**
 * Async ICP synthesis (Mode A).
 *
 * The wizard POST route NEVER runs Claude inline (CLAUDE.md rule 5). It persists
 * the answers as a wizard_session and enqueues a job here; this worker runs the
 * synthesis and publishes `icp.created`. The client polls the session for status.
 */

import { Queue, Worker, type Job } from 'bullmq';
import { Prisma } from '@prisma/client';
import { getRedisConnection } from '../../clients/redis';
import { prisma } from '../../db/client';
import { newCorrelationId } from '../../events';
import { runIcpSynthesis } from './service';
import type { WizardAnswers } from './types';

const QUEUE_NAME = 'icp.synthesis';

export interface SynthesisJobData {
  workspaceId: string;
  sessionId: string;
  answers: WizardAnswers;
  correlationId: string;
  refineIcpId?: string;
}

let queue: Queue<SynthesisJobData> | null = null;

function synthesisQueue(): Queue<SynthesisJobData> {
  if (!queue) {
    queue = new Queue<SynthesisJobData>(QUEUE_NAME, {
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

/** Create the wizard session and enqueue async synthesis. */
export async function startWizardSynthesis(
  workspaceId: string,
  answers: WizardAnswers,
  refineIcpId?: string,
): Promise<{ sessionId: string; correlationId: string }> {
  const correlationId = newCorrelationId();
  const session = await prisma.wizardSession.create({
    data: { workspaceId, answers: answers as Prisma.InputJsonValue, status: 'processing' },
  });
  await synthesisQueue().add('synthesise', {
    workspaceId,
    sessionId: session.id,
    answers,
    correlationId,
    ...(refineIcpId ? { refineIcpId } : {}),
  });
  return { sessionId: session.id, correlationId };
}

/** Poll a workspace-scoped wizard session's status. */
export async function getWizardSession(workspaceId: string, sessionId: string) {
  return prisma.wizardSession.findFirst({
    where: { id: sessionId, workspaceId },
    select: { id: true, status: true, icpId: true, error: true },
  });
}

let worker: Worker<SynthesisJobData> | null = null;

/** Start the synthesis worker. Idempotent. Called from the engine's register(). */
export function startSynthesisWorker(): Worker<SynthesisJobData> {
  if (worker) return worker;
  worker = new Worker<SynthesisJobData>(
    QUEUE_NAME,
    async (job: Job<SynthesisJobData>) => {
      await runIcpSynthesis(job.data);
    },
    { connection: getRedisConnection(), concurrency: 3 },
  );
  return worker;
}
