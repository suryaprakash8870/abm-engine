import { Injectable, Logger } from '@nestjs/common';
import type {
  CrmAdapter,
  CrmAccount,
  CrmContact,
  CreateTaskInput,
  UpsertAccountInput,
  UpsertContactInput,
} from '@abm/shared';

/**
 * Salesforce adapter — second CRM, lands in Phase 4 (see TODO.md, ADR-015).
 * Validated against a free Developer Edition org. Phase 0 ships the shape only
 * so the factory's exhaustive `switch` typechecks today.
 */
@Injectable()
export class SalesforceAdapter implements CrmAdapter {
  readonly provider = 'salesforce' as const;
  private readonly logger = new Logger(SalesforceAdapter.name);

  async getAccounts(_params: { cursor?: string; limit?: number }): Promise<{
    accounts: CrmAccount[];
    nextCursor?: string;
  }> {
    this.logger.warn('SalesforceAdapter.getAccounts — not implemented (Phase 4)');
    return { accounts: [] };
  }

  async getContacts(_params: {
    accountId: string;
    cursor?: string;
    limit?: number;
  }): Promise<{ contacts: CrmContact[]; nextCursor?: string }> {
    this.logger.warn('SalesforceAdapter.getContacts — not implemented (Phase 4)');
    return { contacts: [] };
  }

  async upsertAccount(_input: UpsertAccountInput): Promise<{ externalId: string }> {
    throw new Error('SalesforceAdapter.upsertAccount not implemented (Phase 4)');
  }

  async upsertContact(_input: UpsertContactInput): Promise<{ externalId: string }> {
    throw new Error('SalesforceAdapter.upsertContact not implemented (Phase 4)');
  }

  async createTask(_input: CreateTaskInput): Promise<{ externalId: string }> {
    throw new Error('SalesforceAdapter.createTask not implemented (Phase 4)');
  }
}
