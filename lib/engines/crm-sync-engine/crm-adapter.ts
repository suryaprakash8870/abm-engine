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

export interface CrmAdapter {
  readonly kind: string;
  upsertAccount(w: CrmWrite): Promise<CrmWriteOutcome>;
  upsertContact(w: CrmWrite): Promise<CrmWriteOutcome>;
  createTask(w: CrmWrite): Promise<CrmWriteOutcome>;
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
}

/** Resolve the adapter for a workspace. MVP always returns the mock; a live token
 *  would select the real HubspotAdapter here. */
export function getCrmAdapter(_accessToken: string | null): CrmAdapter {
  return new MockHubspotAdapter();
}
