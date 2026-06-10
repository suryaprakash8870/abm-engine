import { BadRequestException, Body, Controller, Get, Inject, Post, Put } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { eq, sql } from 'drizzle-orm';
import { createDb, organizations } from '@abm/db';
import type { CrmProvider } from '@abm/shared';
import { DB_TOKEN } from '../../common/db/db.module';
import { getCurrentTenant } from '../../common/tenant/tenant-context';
import { SyncSchedulerService } from '../crm-sync/sync-scheduler.service';

type DbHandle = ReturnType<typeof createDb>;

/**
 * Org settings (PLAN 1F/3C): name, Slack webhook, recurring sync control,
 * CRM connection status.
 */
@Controller('settings')
export class SettingsController {
  constructor(
    @Inject(DB_TOKEN) private readonly dbHandle: DbHandle,
    private readonly scheduler: SyncSchedulerService,
    private readonly config: ConfigService,
  ) {}

  @Get()
  async get() {
    const { orgId } = getCurrentTenant();
    const [org] = await this.dbHandle.db
      .select()
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);
    if (!org) throw new BadRequestException('Org not found');

    const recurringSync = await this.scheduler.status(orgId, 'hubspot');

    return {
      org: {
        id: org.id,
        name: org.name,
        slug: org.slug,
        // Webhook URLs are capability secrets — only reveal whether one is set.
        slackWebhookConfigured: Boolean(org.slackWebhookUrl),
      },
      crm: {
        provider: 'hubspot' as const,
        // Phase 1: connection = Service Key in env (ADR-017). Per-org OAuth later.
        connected: Boolean(this.config.get<string>('HUBSPOT_SERVICE_KEY')),
        mode: 'service-key (dev, ADR-017)',
      },
      recurringSync,
      enrichment: {
        provider: this.config.get<string>('APOLLO_API_KEY') ? 'apollo (live)' : 'mock (ADR-014)',
      },
    };
  }

  @Put()
  async update(@Body() body: { name?: string; slackWebhookUrl?: string | null }) {
    const { orgId } = getCurrentTenant();
    if (body.slackWebhookUrl && !/^https:\/\/hooks\.slack\.com\//.test(body.slackWebhookUrl)) {
      throw new BadRequestException('slackWebhookUrl must be a https://hooks.slack.com/... URL');
    }
    const [org] = await this.dbHandle.db
      .update(organizations)
      .set({
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.slackWebhookUrl !== undefined ? { slackWebhookUrl: body.slackWebhookUrl } : {}),
        updatedAt: sql`now()`,
      })
      .where(eq(organizations.id, orgId))
      .returning({ id: organizations.id, name: organizations.name });
    return { updated: true, org };
  }

  /** Enable/disable the recurring CRM sync (PLAN 1E). */
  @Post('recurring-sync')
  async recurringSync(
    @Body() body: { enabled: boolean; everyMinutes?: number; provider?: CrmProvider },
  ) {
    const { orgId } = getCurrentTenant();
    const provider = body.provider ?? 'hubspot';
    if (body.enabled) {
      return this.scheduler.enable(orgId, provider, body.everyMinutes ?? 15);
    }
    return this.scheduler.disable(orgId, provider);
  }
}
