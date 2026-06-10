import { Module } from '@nestjs/common';
import { CrmAdapterModule } from '../crm-adapter/crm-adapter.module';
import { EnrichmentModule } from '../enrichment/enrichment.module';
import { ScoringModule } from '../scoring/scoring.module';
import { CrmSyncProcessor } from './crm-sync.processor';
import { CrmSyncService } from './crm-sync.service';
import { SyncSchedulerService } from './sync-scheduler.service';

/**
 * crm-sync — the bridge module. Owns the worker that pulls accounts from the
 * customer's CRM (via CRM Adapter) into our `accounts` table. Producers
 * (e.g. dev endpoints, scheduled jobs, post-OAuth onboarding) enqueue
 * `sync-accounts-from-crm` jobs onto the `crm-sync` queue, this module
 * consumes them.
 */
@Module({
  imports: [CrmAdapterModule, ScoringModule, EnrichmentModule],
  providers: [CrmSyncService, CrmSyncProcessor, SyncSchedulerService],
  exports: [CrmSyncService, SyncSchedulerService],
})
export class CrmSyncModule {}
