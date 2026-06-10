import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import type { CrmProvider } from '@abm/shared';
import { QUEUES } from '../../common/queue/queue.constants';
import { CrmSyncService } from './crm-sync.service';

export const JOB_SYNC_ACCOUNTS = 'sync-accounts-from-crm';

export interface SyncAccountsJobData {
  orgId: string;
  provider: CrmProvider;
}

@Processor(QUEUES.CRM_SYNC)
export class CrmSyncProcessor extends WorkerHost {
  private readonly logger = new Logger(CrmSyncProcessor.name);

  constructor(private readonly sync: CrmSyncService) {
    super();
  }

  async process(job: Job<SyncAccountsJobData>): Promise<unknown> {
    if (job.name !== JOB_SYNC_ACCOUNTS) {
      throw new Error(`Unknown job name on crm-sync queue: ${job.name}`);
    }
    const { orgId, provider } = job.data;
    this.logger.log(`[${job.id}] starting sync org=${orgId} provider=${provider}`);

    // Forward structured progress to BullMQ — the dev job-status endpoint
    // reads job.progress and the dashboard renders it as a progress bar.
    const result = await this.sync.syncAccountsForOrg(orgId, provider, async (p) => {
      await job.updateProgress(p as unknown as Record<string, unknown>);
    });

    this.logger.log(`[${job.id}] done: ${JSON.stringify(result)}`);
    return result;
  }
}
