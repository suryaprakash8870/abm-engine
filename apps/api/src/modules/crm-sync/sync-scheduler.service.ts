import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import type { CrmProvider } from '@abm/shared';
import { QUEUES } from '../../common/queue/queue.constants';
import { JOB_SYNC_ACCOUNTS } from './crm-sync.processor';

const DEFAULT_EVERY_MINUTES = 15;

/**
 * Recurring sync (PLAN 1E) — BullMQ job schedulers, one per org × provider.
 * `upsertJobScheduler` is idempotent: calling enable twice just updates the
 * interval. Scheduler state lives in Redis, so it survives API restarts.
 */
@Injectable()
export class SyncSchedulerService {
  private readonly logger = new Logger(SyncSchedulerService.name);

  constructor(@InjectQueue(QUEUES.CRM_SYNC) private readonly queue: Queue) {}

  private schedulerId(orgId: string, provider: CrmProvider): string {
    // Dashes, not colons — scheduler ids flow into job ids and BullMQ
    // rejects ':' there.
    return `recurring-sync-${provider}-${orgId}`;
  }

  async enable(
    orgId: string,
    provider: CrmProvider,
    everyMinutes: number = DEFAULT_EVERY_MINUTES,
  ): Promise<{ schedulerId: string; everyMinutes: number }> {
    const clamped = Math.max(5, Math.min(everyMinutes, 24 * 60)); // 5 min – 24 h
    const id = this.schedulerId(orgId, provider);
    await this.queue.upsertJobScheduler(
      id,
      { every: clamped * 60_000 },
      { name: JOB_SYNC_ACCOUNTS, data: { orgId, provider } },
    );
    this.logger.log(`Recurring sync enabled: ${id} every ${clamped}m`);
    return { schedulerId: id, everyMinutes: clamped };
  }

  async disable(orgId: string, provider: CrmProvider): Promise<{ removed: boolean }> {
    const id = this.schedulerId(orgId, provider);
    const removed = await this.queue.removeJobScheduler(id);
    this.logger.log(`Recurring sync disabled: ${id} (existed=${removed})`);
    return { removed };
  }

  async status(orgId: string, provider: CrmProvider) {
    const id = this.schedulerId(orgId, provider);
    const schedulers = await this.queue.getJobSchedulers();
    const found = schedulers.find((s) => s.key === id || s.id === id);
    return found
      ? { enabled: true, everyMinutes: found.every ? Number(found.every) / 60_000 : null, next: found.next ?? null }
      : { enabled: false, everyMinutes: null, next: null };
  }
}
