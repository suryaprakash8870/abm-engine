import { Injectable, Logger } from '@nestjs/common';
import type {
  CrmAdapter,
  CrmAccount,
  CrmContact,
  CreateTaskInput,
  UpsertAccountInput,
  UpsertContactInput,
} from '@abm/shared';
import { HubspotHttpClient } from './hubspot-http-client';

/**
 * HubSpot adapter — first CRM target per ADR-015 / ADR-017.
 *
 * Phase 1 dev: token comes from HUBSPOT_SERVICE_KEY (single test portal).
 * Phase 1.5+: HubspotAdapter accepts a per-org token via opts.token and the
 *   crm-adapter factory resolves it from `crm_connections.access_token_encrypted`
 *   via CryptoService. The HTTP client already supports per-call token override.
 *
 * Only this module is permitted to import HubSpot-specific code (hard rule #3).
 *
 * Upsert semantics (hard rule #7): write-back is match-then-patch. PATCH only
 * touches the properties we send — HubSpot leaves all other fields alone.
 * We NEVER call DELETE for write-back; existing data is preserved.
 */
@Injectable()
export class HubspotAdapter implements CrmAdapter {
  readonly provider = 'hubspot' as const;
  private readonly logger = new Logger(HubspotAdapter.name);

  private static readonly COMPANY_PROPERTIES = [
    'name',
    'domain',
    'industry',
    'numberofemployees',
    'country',
    'website',
    'hs_lastmodifieddate',
  ];

  private static readonly CONTACT_PROPERTIES = [
    'email',
    'phone',
    'firstname',
    'lastname',
    'jobtitle',
    'associatedcompanyid',
    'hs_lastmodifieddate',
  ];

  constructor(private readonly http: HubspotHttpClient) {}

  // ── Reads ─────────────────────────────────────────────────────────────

  async getAccounts(params: { cursor?: string; limit?: number }): Promise<{
    accounts: CrmAccount[];
    nextCursor?: string;
  }> {
    const limit = Math.min(params.limit ?? 100, 100);
    const qs = new URLSearchParams({
      limit: String(limit),
      properties: HubspotAdapter.COMPANY_PROPERTIES.join(','),
      archived: 'false',
    });
    if (params.cursor) qs.set('after', params.cursor);

    const cacheKey = `hubspot:companies:list:${qs.toString()}`;
    const res = await this.http.get<HubspotListResponse<HubspotCompany>>(
      `/crm/v3/objects/companies?${qs.toString()}`,
      { cacheKey, cacheTtlSeconds: 60 },
    );

    return {
      accounts: res.results.map(normalizeCompany),
      nextCursor: res.paging?.next?.after,
    };
  }

  async getContacts(params: {
    accountId: string;
    cursor?: string;
    limit?: number;
  }): Promise<{ contacts: CrmContact[]; nextCursor?: string }> {
    const limit = Math.min(params.limit ?? 100, 100);

    // v4 associations gives us contact IDs immediately (no search-index lag).
    // Then we batch-read full properties. Two round-trips, but accurate writes-now-reads.
    const qs = new URLSearchParams({ limit: String(limit) });
    if (params.cursor) qs.set('after', params.cursor);

    const assoc = await this.http.get<HubspotAssociationsResponse>(
      `/crm/v4/objects/companies/${params.accountId}/associations/contacts?${qs.toString()}`,
    );

    const contactIds = assoc.results.map((r) => String(r.toObjectId));
    if (contactIds.length === 0) {
      return { contacts: [], nextCursor: assoc.paging?.next?.after };
    }

    const batch = await this.http.post<HubspotListResponse<HubspotContact>>(
      '/crm/v3/objects/contacts/batch/read',
      {
        properties: HubspotAdapter.CONTACT_PROPERTIES,
        inputs: contactIds.map((id) => ({ id })),
      },
    );

    return {
      contacts: batch.results.map((c) => normalizeContact(c, params.accountId)),
      nextCursor: assoc.paging?.next?.after,
    };
  }

  // ── Writes (upsert semantics — hard rule #7) ──────────────────────────

  async upsertAccount(input: UpsertAccountInput): Promise<{ externalId: string }> {
    const existingId = await this.resolveCompanyId(input.matchKey);
    if (existingId) {
      await this.http.patch(`/crm/v3/objects/companies/${existingId}`, {
        properties: input.properties,
      });
      return { externalId: existingId };
    }

    // Create — guarantee the match key is stored as a property so the next
    // upsert can find it.
    const props: Record<string, unknown> = { ...input.properties };
    if ('domain' in input.matchKey) props.domain ??= input.matchKey.domain;

    const created = await this.http.post<HubspotCompany>('/crm/v3/objects/companies', {
      properties: props,
    });
    return { externalId: created.id };
  }

  async upsertContact(input: UpsertContactInput): Promise<{ externalId: string }> {
    const existingId = await this.resolveContactId(input.matchKey);
    let externalId = existingId;

    if (externalId) {
      await this.http.patch(`/crm/v3/objects/contacts/${externalId}`, {
        properties: input.properties,
      });
    } else {
      const props: Record<string, unknown> = { ...input.properties };
      if ('email' in input.matchKey) props.email ??= input.matchKey.email;
      if ('phone' in input.matchKey) props.phone ??= input.matchKey.phone;

      const created = await this.http.post<HubspotContact>('/crm/v3/objects/contacts', {
        properties: props,
      });
      externalId = created.id;
    }

    if (input.accountExternalId) {
      // Associate contact → company using v4's "default" association — the
      // primary, HubSpot-defined link that also populates `associatedcompanyid`.
      // (The older v3 path `/associations/.../contact_to_company` is silently
      // a no-op on this API surface — discovered the hard way.)
      await this.http.put(
        `/crm/v4/objects/contacts/${externalId}/associations/default/companies/${input.accountExternalId}`,
        {},
      );
    }

    return { externalId: externalId! };
  }

  async createTask(input: CreateTaskInput): Promise<{ externalId: string }> {
    const props: Record<string, string> = {
      hs_task_subject: input.subject,
      hs_task_body: input.body ?? '',
      hs_timestamp: (input.dueAt ?? new Date()).toISOString(),
      hs_task_status: 'NOT_STARTED',
      hs_task_priority: 'NONE',
    };
    if (input.ownerExternalId) props.hubspot_owner_id = input.ownerExternalId;

    const created = await this.http.post<HubspotTask>('/crm/v3/objects/tasks', {
      properties: props,
    });

    if (input.associatedAccountExternalId) {
      await this.http.put(
        `/crm/v4/objects/tasks/${created.id}/associations/default/companies/${input.associatedAccountExternalId}`,
        {},
      );
    }
    if (input.associatedContactExternalId) {
      await this.http.put(
        `/crm/v4/objects/tasks/${created.id}/associations/default/contacts/${input.associatedContactExternalId}`,
        {},
      );
    }

    return { externalId: created.id };
  }

  // ── Helpers ───────────────────────────────────────────────────────────

  private async resolveCompanyId(matchKey: UpsertAccountInput['matchKey']): Promise<string | undefined> {
    if ('externalId' in matchKey) return matchKey.externalId;

    const res = await this.http.post<HubspotListResponse<HubspotCompany>>(
      '/crm/v3/objects/companies/search',
      {
        filterGroups: [
          { filters: [{ propertyName: 'domain', operator: 'EQ', value: matchKey.domain }] },
        ],
        properties: ['domain'],
        limit: 1,
      },
    );
    return res.results[0]?.id;
  }

  private async resolveContactId(matchKey: UpsertContactInput['matchKey']): Promise<string | undefined> {
    if ('externalId' in matchKey) return matchKey.externalId;

    const propertyName = 'email' in matchKey ? 'email' : 'phone';
    const value = 'email' in matchKey ? matchKey.email : matchKey.phone;

    const res = await this.http.post<HubspotListResponse<HubspotContact>>(
      '/crm/v3/objects/contacts/search',
      {
        filterGroups: [{ filters: [{ propertyName, operator: 'EQ', value }] }],
        properties: [propertyName],
        limit: 1,
      },
    );
    return res.results[0]?.id;
  }
}

// ── HubSpot DTOs + normalizers ──────────────────────────────────────────

interface HubspotListResponse<T> {
  results: T[];
  paging?: { next?: { after: string; link?: string } };
}

interface HubspotAssociationsResponse {
  results: Array<{
    toObjectId: number | string;
    associationTypes?: Array<{ category: string; typeId: number; label?: string }>;
  }>;
  paging?: { next?: { after: string; link?: string } };
}

interface HubspotCompany {
  id: string;
  properties: Record<string, string | null | undefined>;
  createdAt?: string;
  updatedAt?: string;
}

interface HubspotContact {
  id: string;
  properties: Record<string, string | null | undefined>;
  createdAt?: string;
  updatedAt?: string;
}

interface HubspotTask {
  id: string;
  properties: Record<string, string | null | undefined>;
}

function normalizeCompany(c: HubspotCompany): CrmAccount {
  const props = c.properties ?? {};
  return {
    externalId: c.id,
    domain: props.domain ?? undefined,
    name: props.name ?? undefined,
    properties: props,
  };
}

function normalizeContact(c: HubspotContact, fallbackAccountId?: string): CrmContact {
  const props = c.properties ?? {};
  return {
    externalId: c.id,
    email: props.email ?? undefined,
    phone: props.phone ?? undefined,
    firstName: props.firstname ?? undefined,
    lastName: props.lastname ?? undefined,
    title: props.jobtitle ?? undefined,
    accountExternalId: props.associatedcompanyid ?? fallbackAccountId,
    properties: props,
  };
}
