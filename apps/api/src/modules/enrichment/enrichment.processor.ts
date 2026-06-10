import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QUEUES } from '../../common/queue/queue.constants';
import {
  EnrichmentService,
  JOB_ENRICH_ACCOUNT,
  type EnrichAccountJobData,
} from './enrichment.service';

@Processor(QUEUES.ENRICHMENT, { concurrency: 4 })
export class EnrichmentProcessor extends WorkerHost {
  private readonly logger = new Logger(EnrichmentProcessor.name);

  constructor(private readonly enrichment: EnrichmentService) {
    super();
  }

  async process(job: Job<EnrichAccountJobData>): Promise<unknown> {
    if (job.name !== JOB_ENRICH_ACCOUNT) {
      throw new Error(`Unknown job name on enrichment queue: ${job.name}`);
    }
    const { orgId, accountId } = job.data;
    const result = await this.enrichment.enrichAccount(orgId, accountId);
    this.logger.debug(`[${job.id}] enrich account=${accountId} → ${JSON.stringify(result)}`);
    return result;
  }
}
