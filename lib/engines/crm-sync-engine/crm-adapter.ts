/**
 * CRM adapter boundary (engine 10) — the ONLY thing that talks to a CRM SDK.
 *
 * One `CrmAdapter` interface; a Salesforce adapter later is a new class behind the
 * same interface. All writes are UPSERTS (match on a stable key, never blind-create).
 *
 * MVP: MockHubspotAdapter returns deterministic ids with no network — the pipeline
 * works end-to-end without a connected CRM. A real HubspotAdapter (OAuth token +
 * batch API) swaps in once a live connection exists; the rest of the engine is
 * unchanged.
 */

import { createHash } from 'crypto';

export interface CrmWrite {
  recordType: string; // account | contact | play_log
  recordId: string; // ABM-side id (the upsert key)
  fields: Record<string, unknown>;
}

export interface CrmWriteOutcome {
  ok: boolean;
  crmId: string | null;
  operation: 'create' | 'update' | 'upsert';
  response: Record<string, unknown>;
}

// ── Read (import) shapes ─────────────────────────────────────────────────────
export interface CrmCompany { id: string; name: string | null; domain: string | null }
export interface CrmContact { email: string | null; name: string | null; title: string | null; companyIds: string[] }
export interface CrmDeal { id: string; name: string | null; stage: string | null; amount: number | null; closedAt: string | null; companyIds: string[] }

export interface CrmAdapter {
  readonly kind: string;
  upsertAccount(w: CrmWrite): Promise<CrmWriteOutcome>;
  upsertContact(w: CrmWrite): Promise<CrmWriteOutcome>;
  createTask(w: CrmWrite): Promise<CrmWriteOutcome>;
  // Import (HubSpot as INPUT) — read companies / contacts / deals.
  listCompanies(limit?: number): Promise<CrmCompany[]>;
  listContacts(limit?: number): Promise<CrmContact[]>;
  listDeals(limit?: number): Promise<CrmDeal[]>;
}

function mockCrmId(prefix: string, recordId: string): string {
  return `${prefix}_${createHash('sha1').update(recordId).digest('hex').slice(0, 16)}`;
}

/** Deterministic, network-free CRM stand-in. A given ABM record always maps to the
 *  same CRM id, so re-syncs are idempotent upserts. */
export class MockHubspotAdapter implements CrmAdapter {
  readonly kind = 'hubspot_mock';

  private upsert(prefix: string, w: CrmWrite): CrmWriteOutcome {
    const crmId = mockCrmId(prefix, w.recordId);
    return { ok: true, crmId, operation: 'upsert', response: { mock: true, crmId, fields: w.fields } };
  }
  async upsertAccount(w: CrmWrite): Promise<CrmWriteOutcome> { return this.upsert('hsobj', w); }
  async upsertContact(w: CrmWrite): Promise<CrmWriteOutcome> { return this.upsert('hscon', w); }
  async createTask(w: CrmWrite): Promise<CrmWriteOutcome> { return this.upsert('hstask', w); }

  // Deterministic sample CRM data for import testing (no network).
  async listCompanies(): Promise<CrmCompany[]> {
    return [
      { id: 'c1', name: 'Northwind Labs', domain: 'northwind.com' },
      { id: 'c2', name: 'Cobalt AI', domain: 'cobalt.com' },
    ];
  }
  async listContacts(): Promise<CrmContact[]> {
    return [{ email: 'dana@northwind.com', name: 'Dana Reed', title: 'VP RevOps', companyIds: ['c1'] }];
  }
  async listDeals(): Promise<CrmDeal[]> {
    return [
      { id: 'd1', name: 'Northwind — Platform', stage: 'closedwon', amount: 48000, closedAt: '2026-05-01T00:00:00.000Z', companyIds: ['c1'] },
      { id: 'd2', name: 'Cobalt — Pilot', stage: 'closedlost', amount: 12000, closedAt: '2026-05-10T00:00:00.000Z', companyIds: ['c2'] },
    ];
  }
}

// ── Real HubSpot adapter (v3 CRM API) ────────────────────────────────────────

const HS_BASE = 'https://api.hubapi.com';

/** Live HubSpot adapter. Auth = a Private App token or OAuth access token (Bearer).
 *  Every write is a search-then-upsert (match on domain / email), so re-syncs never
 *  duplicate. Failures return { ok:false } (never throw) so the engine dead-letters
 *  the record instead of crashing the batch. */
export class HubspotAdapter implements CrmAdapter {
  readonly kind = 'hubspot';
  constructor(private readonly token: string) {}

  private async hs(path: string, method: string, body?: unknown, attempt = 0): Promise<{ ok: boolean; status: number; json: Record<string, unknown> }> {
    const res = await fetch(`${HS_BASE}${path}`, {
      method,
      headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    // HubSpot enforces a per-second rate cap; on 429 wait (honouring Retry-After)
    // and retry with exponential backoff instead of dead-lettering the record.
    if (res.status === 429 && attempt < 5) {
      const retryAfter = Number(res.headers.get('retry-after'));
      const waitMs = retryAfter > 0 ? retryAfter * 1000 : Math.min(4000, 300 * 2 ** attempt);
      await new Promise((r) => setTimeout(r, waitMs));
      return this.hs(path, method, body, attempt + 1);
    }
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: res.ok, status: res.status, json };
  }

  private async findByProperty(object: string, property: string, value: string): Promise<string | null> {
    if (!value) return null;
    const r = await this.hs(`/crm/v3/objects/${object}/search`, 'POST', {
      filterGroups: [{ filters: [{ propertyName: property, operator: 'EQ', value }] }],
      properties: [property],
      limit: 1,
    });
    const results = (r.json.results as Array<{ id: string }> | undefined) ?? [];
    return results[0]?.id ?? null;
  }

  private async upsertObject(object: string, matchProp: string, matchVal: string, properties: Record<string, unknown>): Promise<CrmWriteOutcome> {
    const clean = Object.fromEntries(Object.entries(properties).filter(([, v]) => v != null && v !== ''));
    const existingId = await this.findByProperty(object, matchProp, matchVal);
    const r = existingId
      ? await this.hs(`/crm/v3/objects/${object}/${existingId}`, 'PATCH', { properties: clean })
      : await this.hs(`/crm/v3/objects/${object}`, 'POST', { properties: clean });
    const crmId = (r.json.id as string | undefined) ?? existingId ?? null;
    return { ok: r.ok, crmId, operation: existingId ? 'update' : 'create', response: r.ok ? { crmId } : { status: r.status, error: r.json } };
  }

  async upsertAccount(w: CrmWrite): Promise<CrmWriteOutcome> {
    const f = w.fields;
    return this.upsertObject('companies', 'domain', String(f.domain ?? ''), {
      name: f.name,
      domain: f.domain,
    });
  }

  async upsertContact(w: CrmWrite): Promise<CrmWriteOutcome> {
    const f = w.fields;
    const [firstname, ...rest] = String(f.full_name ?? '').trim().split(/\s+/);
    return this.upsertObject('contacts', 'email', String(f.email ?? ''), {
      email: f.email,
      firstname: firstname || undefined,
      lastname: rest.join(' ') || undefined,
      jobtitle: f.title,
    });
  }

  async createTask(w: CrmWrite): Promise<CrmWriteOutcome> {
    const f = w.fields;
    const subject = `ABM play: ${String(f.play_type ?? 'follow up').replace(/_/g, ' ')}`;
    const r = await this.hs('/crm/v3/objects/tasks', 'POST', {
      properties: {
        hs_task_subject: subject,
        hs_task_body: `Auto-created by ABM Engine. ${JSON.stringify(f)}`.slice(0, 1000),
        hs_task_status: 'NOT_STARTED',
        hs_timestamp: new Date().toISOString(),
      },
    });
    return { ok: r.ok, crmId: (r.json.id as string) ?? null, operation: 'create', response: r.ok ? { crmId: r.json.id } : { status: r.status, error: r.json } };
  }

  // ── Import (read) ──────────────────────────────────────────────────────────
  private resultsOf(json: Record<string, unknown>): Array<Record<string, unknown>> {
    return (json.results as Array<Record<string, unknown>> | undefined) ?? [];
  }

  async listCompanies(limit = 100): Promise<CrmCompany[]> {
    const r = await this.hs(`/crm/v3/objects/companies?limit=${limit}&properties=name,domain`, 'GET');
    if (!r.ok) return [];
    return this.resultsOf(r.json).map((c) => {
      const p = (c.properties ?? {}) as Record<string, string>;
      return { id: String(c.id), name: p.name ?? null, domain: p.domain ?? null };
    });
  }

  async listContacts(limit = 100): Promise<CrmContact[]> {
    const r = await this.hs(`/crm/v3/objects/contacts?limit=${limit}&properties=email,firstname,lastname,jobtitle&associations=companies`, 'GET');
    if (!r.ok) return [];
    return this.resultsOf(r.json).map((c) => {
      const p = (c.properties ?? {}) as Record<string, string>;
      const name = [p.firstname, p.lastname].filter(Boolean).join(' ') || null;
      return { email: p.email ?? null, name, title: p.jobtitle ?? null, companyIds: assocIds(c, 'companies') };
    });
  }

  async listDeals(limit = 100): Promise<CrmDeal[]> {
    const r = await this.hs(`/crm/v3/objects/deals?limit=${limit}&properties=dealname,dealstage,amount,closedate&associations=companies`, 'GET');
    if (!r.ok) return [];
    return this.resultsOf(r.json).map((d) => {
      const p = (d.properties ?? {}) as Record<string, string>;
      return {
        id: String(d.id),
        name: p.dealname ?? null,
        stage: p.dealstage ?? null,
        amount: p.amount ? Number(p.amount) : null,
        closedAt: p.closedate ?? null,
        companyIds: assocIds(d, 'companies'),
      };
    });
  }
}

/** Pull associated object ids of a given type from a v3 record's associations block. */
function assocIds(record: Record<string, unknown>, type: string): string[] {
  const assoc = (record.associations ?? {}) as Record<string, { results?: Array<{ id: string }> }>;
  return (assoc[type]?.results ?? []).map((a) => String(a.id));
}

/** Resolve the adapter for a workspace. Uses the live HubSpot token when one is
 *  available (OAuth connection token, else the HUBSPOT_SERVICE_KEY private-app
 *  token from env); falls back to the deterministic mock when neither exists. */
export function getCrmAdapter(accessToken: string | null): CrmAdapter {
  const token = accessToken ?? process.env.HUBSPOT_SERVICE_KEY ?? null;
  return token ? new HubspotAdapter(token) : new MockHubspotAdapter();
}
