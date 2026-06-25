/**
 * Core service for the CRM Sync Engine (engine 10).
 *
 * Centralises ALL CRM I/O (rule #8): batch writes by type, rate-limit (Redis token
 * bucket), upsert through the CRM adapter, log every operation, dead-letter
 * failures, and emit crm.synced. Inbound deal webhooks become closed-won/lost.
 *
 * MVP: the adapter is mocked (network-free, deterministic) so the pipeline runs
 * without a live CRM. Idempotent: one sync_job per source event (correlationId),
 * sync_log upserted per (job, record).
 *
 * NOTE (cross-engine reads): tal_accounts (05) + contacts (06) are read to build
 * the write records — the established MVP pattern (ADR-013).
 */

import { createHmac, timingSafeEqual } from 'crypto';
import { prisma } from '../../db/client';
import { Prisma } from '@prisma/client';
import { getRedisConnection } from '../../clients/redis';
import type { CrmType, Json } from '../../events';
import { encryptToken, decryptToken } from './crypto';
import { getCrmAdapter, type CrmAdapter, type CrmWrite } from './crm-adapter';
import { publishCrmDealClosedWon, publishCrmDealClosedLost } from './publisher';

export interface CrmWriteRecord { recordType: string; recordId: string; fields: Record<string, unknown> }

export interface BatchWriteResult {
  syncJobId: string;
  recordsTotal: number;
  recordsSynced: number;
  errors: number;
  status: 'completed' | 'partial' | 'failed';
}

export interface InboundDealChange {
  dealId: string;
  crmType: CrmType;
  domain: string;
  stage: string;
  amount: number | null;
  ownerId: string | null;
  closedAt: string;
  resolution: 'won' | 'lost' | 'open';
  lostReason: string | null;
}

// ── Step 2: batch by type (HubSpot caps at 100/call) ─────────────────────────

export function batchByType(records: CrmWriteRecord[], maxBatchSize = 100): CrmWriteRecord[][] {
  const byType = new Map<string, CrmWriteRecord[]>();
  for (const r of records) {
    const list = byType.get(r.recordType) ?? [];
    list.push(r);
    byType.set(r.recordType, list);
  }
  const batches: CrmWriteRecord[][] = [];
  for (const list of byType.values()) {
    for (let i = 0; i < list.length; i += maxBatchSize) batches.push(list.slice(i, i + maxBatchSize));
  }
  return batches;
}

// ── Step 3: Redis token-bucket rate limit (8 req/s default) ──────────────────

export async function acquireRateLimitToken(workspaceId: string, ratePerSecond = 8): Promise<void> {
  try {
    const r = getRedisConnection();
    const windowKey = `crmrate:${workspaceId}:${Math.floor(Date.now() / 1000)}`;
    const n = await r.incr(windowKey);
    if (n === 1) await r.expire(windowKey, 2);
    if (n > ratePerSecond) await new Promise((res) => setTimeout(res, 1000)); // wait out the 1s window
  } catch {
    /* rate-limit is best-effort; never block a write on a Redis hiccup */
  }
}

// ── Step 4: access token (decrypt; refresh-on-expiry deferred to live adapter) ─

async function resolveAccessToken(workspaceId: string, crmType: CrmType): Promise<string | null> {
  const conn = await prisma.crmConnection.findUnique({ where: { workspaceId_crmType: { workspaceId, crmType } } });
  if (!conn || !conn.isActive) return null; // no connection → mock adapter still works
  // Decrypt to the real token (a live adapter would also refresh-on-expiry here).
  try { return decryptToken(conn.accessTokenEnc); } catch { return null; }
}

// ── Idempotent sync job ──────────────────────────────────────────────────────

async function findOrCreateSyncJob(workspaceId: string, syncType: string, correlationId: string, recordsTotal: number): Promise<{ id: string; reused: boolean }> {
  const existing = await prisma.syncJob.findFirst({ where: { workspaceId, syncType, correlationId } });
  if (existing) return { id: existing.id, reused: true };
  const job = await prisma.syncJob.create({ data: { workspaceId, syncType, correlationId, recordsTotal, status: 'running' } });
  return { id: job.id, reused: false };
}

async function upsertOne(adapter: CrmAdapter, record: CrmWriteRecord): Promise<import('./crm-adapter').CrmWriteOutcome> {
  const w: CrmWrite = { recordType: record.recordType, recordId: record.recordId, fields: record.fields };
  if (record.recordType === 'contact') return adapter.upsertContact(w);
  if (record.recordType === 'play_log') return adapter.createTask(w);
  return adapter.upsertAccount(w);
}

// ── Steps 2-8: write a set of records (batched, rate-limited, logged) ────────

export async function writeRecords(
  workspaceId: string,
  syncType: string,
  records: CrmWriteRecord[],
  correlationId: string,
  crmType: CrmType = 'hubspot',
): Promise<BatchWriteResult> {
  const { id: syncJobId } = await findOrCreateSyncJob(workspaceId, syncType, correlationId, records.length);
  const accessToken = await resolveAccessToken(workspaceId, crmType);
  const adapter = getCrmAdapter(accessToken);

  let recordsSynced = 0;
  let errors = 0;

  for (const batch of batchByType(records)) {
    for (const record of batch) {
      await acquireRateLimitToken(workspaceId);
      let outcome: 'success' | 'dead_lettered' = 'success';
      let response: Record<string, unknown>;
      try {
        const res = await upsertOne(adapter, record);
        if (res.ok) { recordsSynced += 1; response = res.response; }
        else { errors += 1; outcome = 'dead_lettered'; response = { error: 'crm write failed', detail: res.response }; }
      } catch (err) {
        errors += 1;
        outcome = 'dead_lettered';
        response = { error: String(err) };
      }
      // Audit log, idempotent per (job, record) — a retry of the same job won't duplicate.
      await prisma.syncLog.upsert({
        where: { workspaceId_syncJobId_recordId: { workspaceId, syncJobId, recordId: record.recordId } },
        create: { workspaceId, syncJobId, recordType: record.recordType, recordId: record.recordId, operation: 'upsert', outcome, apiResponse: response as Prisma.InputJsonValue },
        update: { outcome, apiResponse: response as Prisma.InputJsonValue, syncedAt: new Date() },
      });
    }
  }

  const status: BatchWriteResult['status'] = errors === 0 ? 'completed' : recordsSynced === 0 ? 'failed' : 'partial';
  await prisma.syncJob.update({ where: { id: syncJobId }, data: { recordsSynced, errors, status, completedAt: new Date() } });
  return { syncJobId, recordsTotal: records.length, recordsSynced, errors, status };
}

// ── Per-event record builders (cross-engine reads) ───────────────────────────

export async function recordsForTalFinalized(workspaceId: string): Promise<CrmWriteRecord[]> {
  const accounts = await prisma.talAccount.findMany({ where: { workspaceId }, select: { accountId: true, name: true, domain: true, tier: true } });
  return accounts.map((a) => ({ recordType: 'account', recordId: a.accountId, fields: { abm_tier: a.tier, name: a.name, domain: a.domain } }));
}

export async function recordsForContactsMapped(workspaceId: string, contactIds: string[]): Promise<CrmWriteRecord[]> {
  if (contactIds.length === 0) return [];
  const contacts = await prisma.contact.findMany({ where: { workspaceId, id: { in: contactIds } }, select: { id: true, fullName: true, email: true, title: true, stakeholderRole: true } });
  return contacts.map((c) => ({ recordType: 'contact', recordId: c.id, fields: { full_name: c.fullName, email: c.email, title: c.title, abm_stakeholder_role: c.stakeholderRole } }));
}

// ── Manual "Push to HubSpot" — on-demand full sync of the current TAL ─────────

export interface CrmSyncSummary {
  mode: 'live' | 'mock';
  accounts: number;
  contacts: number;
  synced: number;
  errors: number;
}

/**
 * Push the workspace's current TAL accounts (with tiers/scores) + their mapped
 * contacts to the CRM in one shot. Powers the "Push to HubSpot" button — the
 * same writeRecords path the event handlers use, just triggered on demand.
 * Live when a CRM connection or HUBSPOT_SERVICE_KEY is present, else mock.
 */
export async function syncTalToCrm(workspaceId: string, correlationId: string): Promise<CrmSyncSummary> {
  const token = await resolveAccessToken(workspaceId, 'hubspot');
  const mode: 'live' | 'mock' = token || process.env.HUBSPOT_SERVICE_KEY ? 'live' : 'mock';

  const accountRecords = await recordsForTalFinalized(workspaceId);
  const contactIds = (await prisma.contact.findMany({ where: { workspaceId }, select: { id: true } })).map((c) => c.id);
  const contactRecords = await recordsForContactsMapped(workspaceId, contactIds);

  const acct = await writeRecords(workspaceId, 'manual_sync_accounts', accountRecords, `${correlationId}_acct`);
  const cont = await writeRecords(workspaceId, 'manual_sync_contacts', contactRecords, `${correlationId}_cont`);

  return {
    mode,
    accounts: accountRecords.length,
    contacts: contactRecords.length,
    synced: acct.recordsSynced + cont.recordsSynced,
    errors: acct.errors + cont.errors,
  };
}

// ── Step 6: parse inbound deal webhook → won/lost/open ───────────────────────

const WON_STAGES = /closed.?won|won/i;
const LOST_STAGES = /closed.?lost|lost/i;

export function parseInboundDealWebhook(crmType: CrmType, body: Record<string, unknown>): InboundDealChange {
  const stage = String(body.stage ?? body.dealstage ?? '');
  const resolution: InboundDealChange['resolution'] = WON_STAGES.test(stage) ? 'won' : LOST_STAGES.test(stage) ? 'lost' : 'open';
  const amountRaw = body.amount ?? null;
  return {
    dealId: String(body.deal_id ?? body.dealId ?? body.objectId ?? ''),
    crmType,
    domain: String(body.domain ?? ''),
    stage,
    amount: typeof amountRaw === 'number' ? amountRaw : amountRaw != null && !Number.isNaN(Number(amountRaw)) ? Number(amountRaw) : null,
    ownerId: body.owner_id != null ? String(body.owner_id) : null,
    closedAt: String(body.closed_at ?? new Date().toISOString()),
    resolution,
    lostReason: body.lost_reason != null ? String(body.lost_reason) : null,
  };
}

/** Resolve a deal's domain to an account_id on the TAL (best-effort, cross-engine). */
export async function resolveAccountByDomain(workspaceId: string, domain: string): Promise<string | null> {
  if (!domain) return null;
  const d = domain.toLowerCase().replace(/^www\./, '');
  const acct = await prisma.talAccount.findFirst({ where: { workspaceId, domain: { equals: d, mode: 'insensitive' } }, orderBy: { score: 'desc' }, select: { accountId: true } });
  return acct?.accountId ?? null;
}

/** Verify a HubSpot deal-webhook HMAC signature. Dev-bypass when no secret is set
 *  (the ?ws= fallback path); a live deployment MUST set HUBSPOT_WEBHOOK_SECRET. */
export function verifyDealWebhookSignature(rawBody: string, signature: string | null): { valid: boolean; devBypass: boolean } {
  const secret = process.env.HUBSPOT_WEBHOOK_SECRET;
  if (!secret) return { valid: true, devBypass: true };
  if (!signature) return { valid: false, devBypass: false };
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  try {
    const a = Buffer.from(expected);
    const b = Buffer.from(signature.replace(/^sha256=/, ''));
    return { valid: a.length === b.length && timingSafeEqual(a, b), devBypass: false };
  } catch {
    return { valid: false, devBypass: false };
  }
}

/** Resolve the workspace for an inbound deal: prefer the verified portalId →
 *  connection mapping; fall back to the ?ws= hint only when no portal maps (dev/mock). */
export async function resolveWorkspaceForDeal(portalId: string | null, wsHint: string | null): Promise<string | null> {
  if (portalId) {
    const conn = await prisma.crmConnection.findFirst({ where: { portalId, isActive: true }, select: { workspaceId: true } });
    if (conn) return conn.workspaceId;
  }
  return wsHint;
}

/** Idempotency for re-delivered deal webhooks (HubSpot retries on timeout). Returns
 *  true the FIRST time a (deal, resolution) is seen, false on a duplicate (skip publish). */
export async function markDealProcessed(workspaceId: string, dealId: string, resolution: string): Promise<boolean> {
  try {
    const res = await getRedisConnection().set(`dealdedup:${workspaceId}:${dealId}:${resolution}`, '1', 'EX', 60 * 60 * 24 * 7, 'NX');
    return res === 'OK';
  } catch {
    return true; // Redis down → publish rather than silently drop a deal close
  }
}

// ── OAuth connection (MVP mock connect; live OAuth deferred) ──────────────────

export async function connectCrmMock(workspaceId: string, crmType: CrmType = 'hubspot'): Promise<{ connected: boolean; portal_id: string }> {
  const portalId = `mock-portal-${workspaceId.slice(0, 6)}`;
  await prisma.crmConnection.upsert({
    where: { workspaceId_crmType: { workspaceId, crmType } },
    create: {
      workspaceId, crmType,
      accessTokenEnc: encryptToken(`mock-access-${workspaceId}`),
      refreshTokenEnc: encryptToken(`mock-refresh-${workspaceId}`),
      expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000),
      portalId, isActive: true,
    },
    update: { isActive: true, accessTokenEnc: encryptToken(`mock-access-${workspaceId}`), expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000) },
  });
  return { connected: true, portal_id: portalId };
}

export async function disconnectCrm(workspaceId: string, crmType: CrmType = 'hubspot'): Promise<void> {
  await prisma.crmConnection.updateMany({ where: { workspaceId, crmType }, data: { isActive: false } });
}

export async function getConnectionStatus(workspaceId: string) {
  const conns = await prisma.crmConnection.findMany({ where: { workspaceId }, select: { crmType: true, isActive: true, portalId: true, connectedAt: true, expiresAt: true } });
  return conns.map((c) => ({ crm_type: c.crmType, status: c.isActive ? 'connected' : 'disconnected', portal_id: c.portalId, connected_at: c.connectedAt.toISOString(), expires_at: c.expiresAt.toISOString() }));
}

// ── Sync log (user-facing debugging) ─────────────────────────────────────────

export async function getSyncLog(workspaceId: string, limit = 500) {
  const rows = await prisma.syncLog.findMany({ where: { workspaceId }, orderBy: { syncedAt: 'desc' }, take: limit });
  return rows.map((r) => ({
    id: r.id, record_type: r.recordType, record_id: r.recordId, operation: r.operation,
    outcome: r.outcome, synced_at: r.syncedAt.toISOString(), detail: (r.apiResponse ?? {}) as Json,
  }));
}

// ── Import: HubSpot as INPUT (ADR-015 #5) ────────────────────────────────────

export interface CrmImportSummary {
  mode: string;            // adapter kind (hubspot | hubspot_mock)
  companies: number;
  contacts: number;
  deals: number;
  closed_won: number;
  closed_lost: number;
  events_emitted: number;  // deal-closed events fed to ICP + Flywheel
}

function isWonStage(stage: string): boolean { return /closed.?won|\bwon\b/i.test(stage); }
function isLostStage(stage: string): boolean { return /closed.?lost|\blost\b/i.test(stage); }

/** HubSpot closedate is ISO or epoch-ms; normalise to ISO. */
function toIso(v: string | null): string {
  if (!v) return new Date().toISOString();
  if (/^\d+$/.test(v)) return new Date(Number(v)).toISOString();
  const d = new Date(v);
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

/**
 * Pull companies / contacts / deals from the CRM. Closed-won/lost deals are
 * republished as `crm.deal_closed_won|lost` events — the critical feedback loop
 * consumed by the ICP Engine (refresh) and GTM Flywheel (attribution).
 */
export async function importFromCrm(workspaceId: string, correlationId: string): Promise<CrmImportSummary> {
  const accessToken = await resolveAccessToken(workspaceId, 'hubspot');
  const adapter = getCrmAdapter(accessToken);

  const [companies, contacts, deals] = await Promise.all([
    adapter.listCompanies(), adapter.listContacts(), adapter.listDeals(),
  ]);
  const domainById = new Map(companies.map((c) => [c.id, c.domain]));

  let won = 0, lost = 0, emitted = 0;
  for (const d of deals) {
    const stage = d.stage ?? '';
    const isWon = isWonStage(stage);
    const isLost = isLostStage(stage);
    if (!isWon && !isLost) continue;

    const domain = d.companyIds.map((id) => domainById.get(id)).find(Boolean) ?? '';
    const accountId = domain ? await resolveAccountByDomain(workspaceId, domain) : null;
    const base = {
      deal_id: d.id, crm_type: 'hubspot' as CrmType, account_id: accountId,
      domain: domain ?? '', amount: d.amount, stage, closed_at: toIso(d.closedAt), owner_id: null,
    };
    if (isWon) { won += 1; await publishCrmDealClosedWon(base, { workspaceId, correlationId }); emitted += 1; }
    else { lost += 1; await publishCrmDealClosedLost({ ...base, lost_reason: null }, { workspaceId, correlationId }); emitted += 1; }
  }

  return {
    mode: adapter.kind,
    companies: companies.length, contacts: contacts.length, deals: deals.length,
    closed_won: won, closed_lost: lost, events_emitted: emitted,
  };
}
