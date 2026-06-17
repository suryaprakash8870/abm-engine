/**
 * Async sourcing queue (engine 06).
 *
 * The tal.finalized handler (and the manual API routes) enqueue one job PER
 * account here — never run Apollo/verify/role-assignment inline in a web request
 * or event handler. The worker runs the per-account committee sourcing and
 * publishes contacts.mapped (or contacts.sourcing_failed) after the completion
 * check passes (verify-before-publish, ADR-003).
 */

import { Queue, Worker, type Job } from 'bullmq';
import { getRedisConnection } from '../../clients/redis';
import { newCorrelationId } from '../../events';
import type { Tier } from '../../events';
import { sourceAccountCommittee } from './service';
import { completionCheck } from './validation';
import { publishContactsMapped, publishContactsSourcingFailed } from './publisher';

const QUEUE_NAME = 'contacts.source';

export interface SourcingJobData {
  workspaceId: string;
  accountId: string;
  tier: Tier;
  domain: string | null;
  name: string | null;
  correlationId: string;
}

let queue: Queue<SourcingJobData> | null = null;

function sourcingQueue(): Queue<SourcingJobData> {
  if (!queue) {
    queue = new Queue<SourcingJobData>(QUEUE_NAME, {
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

export async function enqueueSourcingJob(
  input: Omit<SourcingJobData, 'correlationId'> & { correlationId?: string },
): Promise<void> {
  const correlationId = input.correlationId ?? newCorrelationId();
  // Dedup: one sourcing job per (account, source event) — an event replay or a
  // double-click can't spawn two identical sourcing runs.
  const jobId = `${input.workspaceId}:${input.accountId}:${correlationId}`;
  await sourcingQueue().add('source', { ...input, correlationId }, { jobId });
}

async function runSourcing(data: SourcingJobData): Promise<void> {
  const ctx = { workspaceId: data.workspaceId, correlationId: data.correlationId };

  try {
    const result = await sourceAccountCommittee(
      data.workspaceId, data.accountId, data.tier, data.domain, data.name, data.correlationId,
    );

    const check = completionCheck({
      isTier1: data.tier === 1,
      hasVerifiedRoleAssignedContact: result.hasVerifiedRoleAssignedContact,
      allContactsHaveVerifiedEmailStatus: result.allContactsHaveVerifiedEmailStatus,
      crmPushConfirmed: result.crmPushConfirmed,
      contactsMappedEventPublished: true, // the publish below is the confirmation
    });

    if (result.contactsFound === 0 || !check.ok) {
      await publishContactsSourcingFailed(
        {
          account_id: data.accountId,
          tier: data.tier,
          reason: result.contactsFound === 0 ? 'No contacts found — flag for manual entry.' : 'Completion check failed.',
          failed_check: check.failed[0] ?? 'no_contacts',
          contacts_found: result.contactsFound,
        },
        ctx,
      );
      return;
    }

    await publishContactsMapped(
      {
        account_id: data.accountId,
        tier: data.tier,
        contact_ids: result.contacts.map((c) => c.id),
        dm_contact_ids: result.stakeholderMap.dm,
        champion_contact_ids: result.stakeholderMap.champion,
        influencer_contact_ids: result.stakeholderMap.influencer,
        contacts_found: result.contactsFound,
        verified_email_count: result.verifiedEmailCount,
        stakeholder_map: result.stakeholderMap as unknown as Record<string, unknown>,
      },
      ctx,
    );
  } catch (err) {
    await publishContactsSourcingFailed(
      {
        account_id: data.accountId,
        tier: data.tier,
        reason: String(err),
        failed_check: 'unhandled error',
        contacts_found: 0,
      },
      ctx,
    );
    throw err; // let BullMQ retry
  }
}

let worker: Worker<SourcingJobData> | null = null;

export function startContactWorker(): Worker<SourcingJobData> {
  if (worker) return worker;
  worker = new Worker<SourcingJobData>(
    QUEUE_NAME,
    async (job: Job<SourcingJobData>) => runSourcing(job.data),
    { connection: getRedisConnection(), concurrency: 3 },
  );
  return worker;
}
