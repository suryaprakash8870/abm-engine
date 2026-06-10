import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  CrmAdapter,
  CrmAccount,
  CrmContact,
  CrmDeal,
  CreateTaskInput,
  CustomPropertyDef,
  UpsertAccountInput,
  UpsertContactInput,
} from '@abm/shared';

/**
 * Salesforce adapter — second CRM (Phase 4, ADR-015), implemented against the
 * REST API (SOQL queries + sobject create/patch).
 *
 * ⚠️ STATUS: implemented, UNTESTED — needs a free Developer Edition org to
 * verify (see PLAN.md 4E). Dev auth is env-based (`SALESFORCE_INSTANCE_URL` +
 * `SALESFORCE_ACCESS_TOKEN`), mirroring the HubSpot Service-Key pattern of
 * ADR-017; per-org OAuth lands with the first Salesforce customer.
 *
 * Pagination: SOQL OFFSET (max 2000) — fine for dev-org volumes; swap to
 * queryMore/nextRecordsUrl when a real org exceeds that.
 *
 * Write-back custom fields: Salesforce custom fields can't be created via the
 * REST data API (needs Metadata API) — `ensureCustomProperties` therefore
 * verifies the `abm_*__c` fields exist and throws a setup instruction if not.
 */
@Injectable()
export class SalesforceAdapter implements CrmAdapter {
  readonly provider = 'salesforce' as const;
  private readonly logger = new Logger(SalesforceAdapter.name);
  private readonly apiVersion = 'v59.0';

  private readonly instanceUrl: string | undefined;
  private readonly accessToken: string | undefined;

  constructor(config: ConfigService) {
    this.instanceUrl = config.get<string>('SALESFORCE_INSTANCE_URL');
    this.accessToken = config.get<string>('SALESFORCE_ACCESS_TOKEN');
  }

  // ── Reads ─────────────────────────────────────────────────────────────

  async getAccounts(params: { cursor?: string; limit?: number }): Promise<{
    accounts: CrmAccount[];
    nextCursor?: string;
  }> {
    const limit = Math.min(params.limit ?? 100, 200);
    const offset = params.cursor ? Number(params.cursor) : 0;
    const soql =
      `SELECT Id, Name, Website, Industry, NumberOfEmployees, BillingCountry ` +
      `FROM Account ORDER BY Id LIMIT ${limit} OFFSET ${offset}`;
    const res = await this.query<SfAccount>(soql);

    return {
      accounts: res.records.map((a) => ({
        externalId: a.Id,
        domain: domainFromWebsite(a.Website),
        name: a.Name ?? undefined,
        properties: {
          industry: a.Industry ?? undefined,
          numberofemployees: a.NumberOfEmployees ?? undefined,
          country: a.BillingCountry ?? undefined,
          website: a.Website ?? undefined,
        },
      })),
      nextCursor: res.records.length === limit ? String(offset + limit) : undefined,
    };
  }

  async getContacts(params: {
    accountId: string;
    cursor?: string;
    limit?: number;
  }): Promise<{ contacts: CrmContact[]; nextCursor?: string }> {
    const limit = Math.min(params.limit ?? 100, 200);
    const offset = params.cursor ? Number(params.cursor) : 0;
    const soql =
      `SELECT Id, Email, Phone, FirstName, LastName, Title, AccountId ` +
      `FROM Contact WHERE AccountId = '${escapeSoql(params.accountId)}' ` +
      `ORDER BY Id LIMIT ${limit} OFFSET ${offset}`;
    const res = await this.query<SfContact>(soql);

    return {
      contacts: res.records.map((c) => ({
        externalId: c.Id,
        email: c.Email ?? undefined,
        phone: c.Phone ?? undefined,
        firstName: c.FirstName ?? undefined,
        lastName: c.LastName ?? undefined,
        title: c.Title ?? undefined,
        accountExternalId: c.AccountId ?? params.accountId,
      })),
      nextCursor: res.records.length === limit ? String(offset + limit) : undefined,
    };
  }

  async getDeals(params: { cursor?: string; limit?: number }): Promise<{
    deals: CrmDeal[];
    nextCursor?: string;
  }> {
    const limit = Math.min(params.limit ?? 100, 200);
    const offset = params.cursor ? Number(params.cursor) : 0;
    const soql =
      `SELECT Id, Name, Amount, StageName, CloseDate, CreatedDate, IsWon, IsClosed, AccountId ` +
      `FROM Opportunity ORDER BY Id LIMIT ${limit} OFFSET ${offset}`;
    const res = await this.query<SfOpportunity>(soql);

    return {
      deals: res.records.map((o) => ({
        externalId: o.Id,
        name: o.Name ?? undefined,
        amount: o.Amount ?? undefined,
        stage: o.StageName ?? undefined,
        isClosedWon: Boolean(o.IsClosed && o.IsWon),
        isClosedLost: Boolean(o.IsClosed && !o.IsWon),
        createdAt: o.CreatedDate ?? undefined,
        closedAt: o.CloseDate ?? undefined,
        accountExternalIds: o.AccountId ? [o.AccountId] : [],
      })),
      nextCursor: res.records.length === limit ? String(offset + limit) : undefined,
    };
  }

  // ── Writes (upsert semantics — hard rule #7) ──────────────────────────

  async upsertAccount(input: UpsertAccountInput): Promise<{ externalId: string }> {
    let id: string | undefined;
    if ('externalId' in input.matchKey) {
      id = input.matchKey.externalId;
    } else {
      const res = await this.query<{ Id: string }>(
        `SELECT Id FROM Account WHERE Website LIKE '%${escapeSoql(input.matchKey.domain)}%' LIMIT 1`,
      );
      id = res.records[0]?.Id;
    }

    const body = mapToSfAccountFields(input.properties);
    if (id) {
      await this.request('PATCH', `/sobjects/Account/${id}`, body);
      return { externalId: id };
    }
    const created = await this.request<SfCreateResponse>('POST', '/sobjects/Account', {
      Name: (input.properties.name as string) ?? ('domain' in input.matchKey ? input.matchKey.domain : 'Unknown'),
      ...body,
      Website: body.Website ?? ('domain' in input.matchKey ? input.matchKey.domain : undefined),
    });
    return { externalId: created.id };
  }

  async upsertContact(input: UpsertContactInput): Promise<{ externalId: string }> {
    let id: string | undefined;
    if ('externalId' in input.matchKey) {
      id = input.matchKey.externalId;
    } else {
      const field = 'email' in input.matchKey ? 'Email' : 'Phone';
      const value = 'email' in input.matchKey ? input.matchKey.email : input.matchKey.phone;
      const res = await this.query<{ Id: string }>(
        `SELECT Id FROM Contact WHERE ${field} = '${escapeSoql(value)}' LIMIT 1`,
      );
      id = res.records[0]?.Id;
    }

    const body = mapToSfContactFields(input.properties);
    if (input.accountExternalId) body.AccountId = input.accountExternalId;

    if (id) {
      await this.request('PATCH', `/sobjects/Contact/${id}`, body);
      return { externalId: id };
    }
    const created = await this.request<SfCreateResponse>('POST', '/sobjects/Contact', {
      LastName: (body.LastName as string) ?? 'Unknown',
      ...body,
      Email: body.Email ?? ('email' in input.matchKey ? input.matchKey.email : undefined),
    });
    return { externalId: created.id };
  }

  async createTask(input: CreateTaskInput): Promise<{ externalId: string }> {
    const created = await this.request<SfCreateResponse>('POST', '/sobjects/Task', {
      Subject: input.subject,
      Description: input.body ?? '',
      ActivityDate: (input.dueAt ?? new Date()).toISOString().slice(0, 10),
      Status: 'Not Started',
      WhatId: input.associatedAccountExternalId,
      WhoId: input.associatedContactExternalId,
      OwnerId: input.ownerExternalId,
    });
    return { externalId: created.id };
  }

  private readonly ensuredProperties = new Set<string>();

  async ensureCustomProperties(defs: CustomPropertyDef[]): Promise<void> {
    for (const def of defs) {
      const objectType = def.object === 'account' ? 'Account' : 'Contact';
      const fieldName = `${def.name}__c`;
      const cacheKey = `${objectType}:${fieldName}`;
      if (this.ensuredProperties.has(cacheKey)) continue;

      const describe = await this.request<SfDescribeResponse>(
        'GET',
        `/sobjects/${objectType}/describe`,
      );
      const exists = describe.fields.some((f) => f.name === fieldName);
      if (!exists) {
        // Custom-field creation needs the Metadata API (SOAP/Tooling), out of
        // scope for the data adapter. One-time admin setup instead.
        throw new Error(
          `Salesforce field ${objectType}.${fieldName} missing — create it once in ` +
            `Setup → Object Manager → ${objectType} → Fields (type: ${def.type === 'number' ? 'Number' : 'Text'}).`,
        );
      }
      this.ensuredProperties.add(cacheKey);
    }
  }

  // ── HTTP plumbing ─────────────────────────────────────────────────────

  private async query<T>(soql: string): Promise<{ records: T[] }> {
    return this.request<{ records: T[] }>('GET', `/query?q=${encodeURIComponent(soql)}`);
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    if (!this.instanceUrl || !this.accessToken) {
      throw new Error(
        'Salesforce not configured — set SALESFORCE_INSTANCE_URL and SALESFORCE_ACCESS_TOKEN ' +
          '(Developer Edition org, see PLAN.md 4E).',
      );
    }
    const url = `${this.instanceUrl}/services/data/${this.apiVersion}${path}`;
    const res = await fetch(url, {
      method,
      headers: {
        authorization: `Bearer ${this.accessToken}`,
        'content-type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`Salesforce ${method} ${path} → ${res.status}: ${text.slice(0, 300)}`);
    }
    return text ? (JSON.parse(text) as T) : (undefined as T);
  }
}

// ── DTOs + field mapping ─────────────────────────────────────────────────

interface SfAccount {
  Id: string;
  Name: string | null;
  Website: string | null;
  Industry: string | null;
  NumberOfEmployees: number | null;
  BillingCountry: string | null;
}

interface SfContact {
  Id: string;
  Email: string | null;
  Phone: string | null;
  FirstName: string | null;
  LastName: string | null;
  Title: string | null;
  AccountId: string | null;
}

interface SfOpportunity {
  Id: string;
  Name: string | null;
  Amount: number | null;
  StageName: string | null;
  CloseDate: string | null;
  CreatedDate: string | null;
  IsWon: boolean | null;
  IsClosed: boolean | null;
  AccountId: string | null;
}

interface SfCreateResponse {
  id: string;
  success: boolean;
}

interface SfDescribeResponse {
  fields: Array<{ name: string }>;
}

/** Map our normalized property names → Salesforce field names. abm_* → abm_*__c. */
function mapToSfAccountFields(props: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(props)) {
    if (key.startsWith('abm_')) out[`${key}__c`] = value === '' ? null : value;
    else if (key === 'name') out.Name = value;
    else if (key === 'website') out.Website = value;
    else if (key === 'industry') out.Industry = value;
    else if (key === 'numberofemployees') out.NumberOfEmployees = value;
    else if (key === 'country') out.BillingCountry = value;
  }
  return out;
}

function mapToSfContactFields(props: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(props)) {
    if (key.startsWith('abm_')) out[`${key}__c`] = value === '' ? null : value;
    else if (key === 'email') out.Email = value;
    else if (key === 'phone') out.Phone = value;
    else if (key === 'firstname') out.FirstName = value;
    else if (key === 'lastname') out.LastName = value;
    else if (key === 'jobtitle') out.Title = value;
  }
  return out;
}

function domainFromWebsite(website: string | null): string | undefined {
  if (!website) return undefined;
  try {
    const url = website.startsWith('http') ? website : `https://${website}`;
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return undefined;
  }
}

function escapeSoql(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}
