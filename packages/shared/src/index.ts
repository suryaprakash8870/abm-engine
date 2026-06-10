export type CrmProvider = 'hubspot' | 'salesforce';

export type Tier = 1 | 2 | 3;

export type SignalParty = 'first' | 'second' | 'third';

export type AwarenessStage =
  | 'identified'
  | 'aware'
  | 'engaged'
  | 'considering'
  | 'selecting';

export type ContactRole = 'influencer' | 'decision_maker' | 'champion' | 'unknown';

/**
 * The minimal CRM Adapter contract. Every CRM implementation
 * (HubSpot, Salesforce, …) speaks this interface; nothing else
 * in the app talks to a CRM directly. See ADR-003 / hard rule #3.
 */
export interface CrmAdapter {
  readonly provider: CrmProvider;

  getAccounts(params: { cursor?: string; limit?: number }): Promise<{
    accounts: CrmAccount[];
    nextCursor?: string;
  }>;

  getContacts(params: { accountId: string; cursor?: string; limit?: number }): Promise<{
    contacts: CrmContact[];
    nextCursor?: string;
  }>;

  upsertAccount(input: UpsertAccountInput): Promise<{ externalId: string }>;
  upsertContact(input: UpsertContactInput): Promise<{ externalId: string }>;
  createTask(input: CreateTaskInput): Promise<{ externalId: string }>;
}

export interface CrmAccount {
  externalId: string;
  domain?: string;
  name?: string;
  properties?: Record<string, unknown>;
}

export interface CrmContact {
  externalId: string;
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  title?: string;
  accountExternalId?: string;
  properties?: Record<string, unknown>;
}

export interface UpsertAccountInput {
  matchKey: { domain: string } | { externalId: string };
  properties: Record<string, unknown>;
}

export interface UpsertContactInput {
  matchKey: { email: string } | { phone: string } | { externalId: string };
  properties: Record<string, unknown>;
  accountExternalId?: string;
}

export interface CreateTaskInput {
  ownerExternalId?: string;
  subject: string;
  body?: string;
  dueAt?: Date;
  associatedAccountExternalId?: string;
  associatedContactExternalId?: string;
}
