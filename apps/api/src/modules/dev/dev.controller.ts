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
import { CrmAdapterFactory } from '../crm-adapter/crm-adapter.factory';
import { HubspotHttpError } from '../crm-adapter/hubspot/hubspot-http-client';

/**
 * Dev-only smoke endpoints. NOT for production — these bypass tenant auth and
 * use the single Service Key from .env. Remove or gate behind NODE_ENV=development
 * before exposing the API externally.
 *
 * Purpose: prove the HubspotAdapter actually talks to HubSpot end-to-end.
 */
@Controller('dev/hubspot')
export class DevController {
  constructor(
    private readonly crm: CrmAdapterFactory,
    private readonly config: ConfigService,
  ) {}

  @Get('accounts')
  async accounts(@Query('limit') limit?: string, @Query('cursor') cursor?: string) {
    this.ensureConfigured();
    return this.wrap(() =>
      this.crm.forProvider('hubspot').getAccounts({
        limit: limit ? Number(limit) : 25,
        cursor,
      }),
    );
  }

  @Get('accounts/:id/contacts')
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

  @Post('accounts/upsert')
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

  @Post('contacts/upsert')
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

  @Post('tasks')
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
