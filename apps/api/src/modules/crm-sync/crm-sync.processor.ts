import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import type { CrmProvider } from '@abm/shared';
import { QUEUES } from '../../common/queue/queue.constants';
import { CrmSyncService } from './crm-sync.service';

export const JOB_SYNC_ACCOUNTS = 'sync-accounts-from-crm';
export const JOB_SYNC_CONTACTS = 'sync-contacts-from-crm';

export interface SyncAccountsJobData {
  orgId: string;
  provider: CrmProvider;
}

@Processor(QUEUES.CRM_SYNC)
export class CrmSyncProcessor extends WorkerHost {
  private readonly logger = new Logger(CrmSyncProcessor.name);

  constructor(
    private readonly sync: CrmSyncService,
    @InjectQueue(QUEUES.CRM_SYNC) private readonly queue: Queue,
  ) {
    super();
  }

  async process(job: Job<SyncAccountsJobData>): Promise<unknown> {
    const { orgId, provider } = job.data;

    switch (job.name) {
      case JOB_SYNC_ACCOUNTS: {
        this.logger.log(`[${job.id}] starting account sync org=${orgId} provider=${provider}`);
        const result = await this.sync.syncAccountsForOrg(orgId, provider, async (p) => {
          await job.updateProgress(p as unknown as Record<string, unknown>);
        });

        // Chain the contacts sync (Playbook Step 7) — separate job so a
        // contacts failure never marks the account sync failed.
        await this.queue.add(
          JOB_SYNC_CONTACTS,
          { orgId, provider },
          { jobId: `sync-contacts-${provider}-${orgId}-${job.id}` },
        );

        this.logger.log(`[${job.id}] done: ${JSON.stringify(result)}`);
        return result;
      }

      case JOB_SYNC_CONTACTS: {
        this.logger.log(`[${job.id}] starting contacts sync org=${orgId} provider=${provider}`);
        const result = await this.sync.syncContactsForOrg(orgId, provider);
        this.logger.log(`[${job.id}] done: ${JSON.stringify(result)}`);
        return result;
      }

      default:
        throw new Error(`Unknown job name on crm-sync queue: ${job.name}`);
    }
  }
}
