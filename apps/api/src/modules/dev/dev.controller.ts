import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { CrmAdapterFactory } from '../crm-adapter/crm-adapter.factory';
import { HubspotHttpError } from '../crm-adapter/hubspot/hubspot-http-client';
import { QUEUES } from '../../common/queue/queue.constants';
import { JOB_SYNC_ACCOUNTS } from '../crm-sync/crm-sync.processor';
import { DevSeedService } from './dev-seed.service';

/**
 * Dev-only smoke endpoints. NOT for production — these bypass tenant auth and
 * use the single Service Key from .env. Remove or gate behind NODE_ENV=development
 * before exposing the API externally.
 *
 * Purpose: prove the HubspotAdapter actually talks to HubSpot end-to-end.
 */
@Controller('dev')
export class DevController {
  constructor(
    private readonly crm: CrmAdapterFactory,
    private readonly config: ConfigService,
    private readonly seed: DevSeedService,
    @InjectQueue(QUEUES.CRM_SYNC) private readonly crmSyncQueue: Queue,
  ) {}

  @Get('hubspot/accounts')
  async accounts(@Query('limit') limit?: string, @Query('cursor') cursor?: string) {
    this.ensureConfigured();
    return this.wrap(() =>
      this.crm.forProvider('hubspot').getAccounts({
        limit: limit ? Number(limit) : 25,
        cursor,
      }),
    );
  }

  @Get('hubspot/accounts/:id/contacts')
  async contacts(
    @Param('id') accountId: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    this.ensureConfigured();
    return this.wrap(() =>
      this.crm.forProvider('hubspot').getContacts({
        accountId,
        limit: limit ? Number(limit) : 25,
        cursor,
      }),
    );
  }

  @Post('hubspot/accounts/upsert')
  async upsertAccount(
    @Body() body: { domain: string; properties: Record<string, unknown> },
  ) {
    this.ensureConfigured();
    return this.wrap(() =>
      this.crm.forProvider('hubspot').upsertAccount({
        matchKey: { domain: body.domain },
        properties: body.properties,
      }),
    );
  }

  @Post('hubspot/contacts/upsert')
  async upsertContact(
    @Body()
    body: {
      email: string;
      properties: Record<string, unknown>;
      accountExternalId?: string;
    },
  ) {
    this.ensureConfigured();
    return this.wrap(() =>
      this.crm.forProvider('hubspot').upsertContact({
        matchKey: { email: body.email },
        properties: body.properties,
        accountExternalId: body.accountExternalId,
      }),
    );
  }

  @Post('hubspot/tasks')
  async createTask(
    @Body()
    body: {
      subject: string;
      body?: string;
      dueAt?: string;
      associatedAccountExternalId?: string;
      associatedContactExternalId?: string;
    },
  ) {
    this.ensureConfigured();
    return this.wrap(() =>
      this.crm.forProvider('hubspot').createTask({
        subject: body.subject,
        body: body.body,
        dueAt: body.dueAt ? new Date(body.dueAt) : undefined,
        associatedAccountExternalId: body.associatedAccountExternalId,
        associatedContactExternalId: body.associatedContactExternalId,
      }),
    );
  }

  /**
   * Seed 30 synthetic B2B accounts directly into Postgres (no HubSpot needed).
   * Upserts on (org_id, domain) so it's safe to re-run — existing HubSpot rows
   * won't be touched because their domain values differ.
   */
  @Post('seed/accounts')
  async seedAccounts(@Body() body: { orgId: string }) {
    if (!body?.orgId) {
      throw new ServiceUnavailableException('orgId required in body');
    }
    return this.seed.seedAccounts(body.orgId);
  }

  /** Enqueue a sync job to pull all HubSpot companies into our accounts table. */
  @Post('sync/accounts')
  async syncAccounts(@Body() body: { orgId: string }) {
    this.ensureConfigured();
    if (!body?.orgId) {
      throw new ServiceUnavailableException('orgId required in body');
    }
    const job = await this.crmSyncQueue.add(
      JOB_SYNC_ACCOUNTS,
      { orgId: body.orgId, provider: 'hubspot' },
      { jobId: `sync-hubspot-${body.orgId}` }, // dedupe — only one active sync per org (no ':' — BullMQ forbids it)
    );
    return { jobId: job.id, queue: this.crmSyncQueue.name };
  }

  /** Poll a sync job. Useful for the smoke test after enqueueing. */
  @Get('sync/jobs/:id')
  async jobStatus(@Param('id') id: string) {
    const job = await this.crmSyncQueue.getJob(id);
    if (!job) return { status: 'not_found' };
    const state = await job.getState();
    return {
      id: job.id,
      name: job.name,
      state,
      progress: job.progress,
      returnvalue: job.returnvalue,
      failedReason: job.failedReason,
      attemptsMade: job.attemptsMade,
    };
  }

  private ensureConfigured() {
    if (!this.config.get<string>('HUBSPOT_SERVICE_KEY')) {
      throw new ServiceUnavailableException(
        'HUBSPOT_SERVICE_KEY not configured — add it to .env.',
      );
    }
  }

  private async wrap<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof HubspotHttpError) {
        throw new ServiceUnavailableException({
          message: 'HubSpot API call failed',
          status: err.status,
          path: err.path,
          body: err.body.slice(0, 500),
        });
      }
      throw err;
    }
  }
}
