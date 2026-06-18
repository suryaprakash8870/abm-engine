/**
 * Signal Engine — core service logic (engine 07).
 *
 * Primary intake is HTTP (POST /signals/track, POST /webhooks/*), NOT the event
 * bus. Each signal: resolve to a TAL account → classify + score → normalise →
 * dedup (5-min Redis window, DB unique backstop) → store → publish signal.received.
 *
 * Owned tables: signals, signal_sources, webhook_log, tracking_tokens, visitor_sessions.
 *
 * MVP mocks (no paid keys): RB2B IP→company resolution is mocked deterministically;
 * webhook signatures verify against an env secret or dev-bypass when unset.
 *
 * NOTE (cross-engine read): account resolution reads tal_accounts (Engine 05) to
 * match a visitor/webhook to a target account — the established MVP pattern (ADR-013).
 */

import { createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { prisma } from '../../db/client';
import { getRedisConnection } from '../../clients/redis';
import { Prisma } from '@prisma/client';
import type { SignalReceivedPayload } from '../../events';

// ── Common types ─────────────────────────────────────────────────────────────

export type SignalSourceType = 'website' | 'crm_webhook' | 'email_webhook';

export interface TrackingHit {
  ip: string;
  url: string;
  sessionId: string;
  userAgent: string | null;
  /** Test-snippet / known-company hints (skip mock IP resolution). */
  domain?: string | null;
  accountId?: string | null;
  occurredAt?: string;
}

export interface NormalisedSignal {
  accountId: string;
  contactId: string | null;
  signalType: string;
  signalSource: string;
  pointsAwarded: number;
  decayRatePerWeek: number;
  pageUrl: string | null;
  metadata: Record<string, unknown>;
  dedupKey: string;
  occurredAt: string;
}

export type IngestResult =
  | { status: 'published'; payload: SignalReceivedPayload }
  | { status: 'duplicate'; dedupKey: string }
  | { status: 'discarded'; reason: string };

// ── Tracking tokens (snippet auth) ───────────────────────────────────────────

export async function resolveTrackingToken(token: string): Promise<string | null> {
  if (!token) return null;
  const row = await prisma.trackingToken.findUnique({ where: { token }, select: { workspaceId: true } });
  return row?.workspaceId ?? null;
}

/** One tracking token per workspace; created on first request (for the UI snippet). */
export async function getOrCreateTrackingToken(workspaceId: string): Promise<string> {
  const existing = await prisma.trackingToken.findUnique({ where: { workspaceId }, select: { token: true } });
  if (existing) return existing.token;
  const token = `abmtrk_${randomBytes(16).toString('hex')}`;
  const created = await prisma.trackingToken.upsert({
    where: { workspaceId },
    create: { workspaceId, token },
    update: {},
    select: { token: true },
  });
  return created.token;
}

// ── Step: bot filtering (rule-based, no LLM — real-time hot path) ─────────────

const BOT_UA = /bot|crawler|spider|crawl|headless|phantom|slurp|curl|wget|python-requests|axios|libwww|scrapy|monitor|preview/i;

export function isBot(userAgent: string | null): boolean {
  if (!userAgent) return true; // no UA on a browser pageview is almost always a bot/script
  return BOT_UA.test(userAgent);
}

// ── Step 2: resolve a visitor/webhook to a TAL account (mock RB2B) ───────────

function ipHash(ip: string): string {
  return createHash('sha256').update(ip).digest('hex').slice(0, 32); // never store the raw IP
}

function cheapHash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return Math.abs(h);
}

/**
 * Resolve a hit to a TAL account. Explicit domain/accountId hints win (test
 * snippet, webhooks that carry a company domain); otherwise a deterministic mock
 * stands in for RB2B. Returns null when no TAL account matches (signal discarded).
 */
export async function resolveHitToAccount(
  workspaceId: string,
  hit: { ip: string; sessionId: string; domain?: string | null; accountId?: string | null },
): Promise<{ accountId: string; domain: string | null } | null> {
  const tal = await prisma.talAccount.findMany({ where: { workspaceId }, select: { accountId: true, domain: true } });
  if (tal.length === 0) return null;

  let match: { accountId: string; domain: string | null } | undefined;
  if (hit.accountId) match = tal.find((a) => a.accountId === hit.accountId);
  if (!match && hit.domain) {
    const d = hit.domain.toLowerCase().replace(/^www\./, '');
    match = tal.find((a) => a.domain && a.domain.toLowerCase().replace(/^www\./, '') === d);
  }
  if (!match && !hit.domain && !hit.accountId) {
    // Mock RB2B: map the visitor deterministically to one of the workspace's TAL accounts.
    match = tal[cheapHash(`${hit.ip}|${hit.sessionId}`) % tal.length];
  }
  if (!match) return null;

  await prisma.visitorSession.upsert({
    where: { workspaceId_sessionId: { workspaceId, sessionId: hit.sessionId } },
    create: { workspaceId, sessionId: hit.sessionId, accountId: match.accountId, ipHash: ipHash(hit.ip) },
    update: { accountId: match.accountId, lastSeen: new Date() },
  });
  return { accountId: match.accountId, domain: match.domain };
}

// ── Step 3: classify page intent → signal type + points + decay ──────────────

const PAGE_INTENT: Array<{ re: RegExp; type: string; points: number; decay: number }> = [
  { re: /\/demo|request-demo|book-a|get-started/, type: 'demo_request_view', points: 30, decay: 0.4 },
  { re: /pricing|\/plans|\/cost/, type: 'pricing_page_view', points: 25, decay: 0.5 },
  { re: /roi|calculator|\/estimate/, type: 'roi_calculator_view', points: 28, decay: 0.4 },
  { re: /compare|comparison|-vs-|alternatives?/, type: 'comparison_page_view', points: 22, decay: 0.5 },
  { re: /integrations?|features?|\/product|\/platform/, type: 'product_page_view', points: 10, decay: 0.4 },
  { re: /docs|documentation|\/api|developers?/, type: 'docs_view', points: 6, decay: 0.6 },
  { re: /blog|resources|\/guide|case-stud/, type: 'content_view', points: 3, decay: 0.7 },
];

export function classifyPageIntent(url: string): { signalType: string; pointsAwarded: number; decayRatePerWeek: number } {
  const path = (() => { try { return new URL(url).pathname.toLowerCase(); } catch { return (url || '').toLowerCase(); } })();
  for (const p of PAGE_INTENT) if (p.re.test(path)) return { signalType: p.type, pointsAwarded: p.points, decayRatePerWeek: p.decay };
  return { signalType: 'generic_pageview', pointsAwarded: 5, decayRatePerWeek: 0.5 };
}

// ── Step 4: CRM/email webhook signature + mapping ────────────────────────────

const CRM_EVENTS: Record<string, { type: string; points: number; decay: number }> = {
  'deal.stage_advanced': { type: 'deal_stage_advanced', points: 30, decay: 0.3 },
  'deal.created': { type: 'deal_created', points: 20, decay: 0.3 },
  'email.reply': { type: 'email_reply', points: 20, decay: 0.4 },
  'email.click': { type: 'email_click', points: 10, decay: 0.5 },
  'email.open': { type: 'email_open', points: 5, decay: 0.6 },
  'form.submission': { type: 'form_submission', points: 18, decay: 0.4 },
};

/**
 * Verify an HMAC-SHA256 webhook signature against the source's secret. With no
 * secret configured (local dev) we accept but flag it, so the pipeline is testable.
 */
export function verifyWebhookSignature(source: string, rawBody: string, signatureHeader: string | null): { valid: boolean; devBypass: boolean } {
  const secret = source === 'hubspot' ? process.env.HUBSPOT_WEBHOOK_SECRET : source === 'outreach' ? process.env.OUTREACH_WEBHOOK_SECRET : undefined;
  if (!secret) {
    // Dev-only convenience so the pipeline is testable without a configured secret.
    // In production we NEVER accept an unsigned webhook — refuse instead.
    if (process.env.NODE_ENV === 'production') return { valid: false, devBypass: false };
    return { valid: true, devBypass: true };
  }
  if (!signatureHeader) return { valid: false, devBypass: false };
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  try {
    const a = Buffer.from(expected);
    const b = Buffer.from(signatureHeader.replace(/^sha256=/, ''));
    return { valid: a.length === b.length && timingSafeEqual(a, b), devBypass: false };
  } catch {
    return { valid: false, devBypass: false };
  }
}

interface RawCrmEvent { event_type?: string; domain?: string; account_id?: string; email?: string; url?: string; occurred_at?: string }

/** Map a verified webhook body into raw CRM signals. Accepts {events:[...]} or a single event. */
export function mapWebhookToRawSignals(parsedBody: Record<string, unknown>): RawCrmEvent[] {
  const events = Array.isArray((parsedBody as { events?: unknown }).events)
    ? ((parsedBody as { events: unknown[] }).events as RawCrmEvent[])
    : [parsedBody as RawCrmEvent];
  return events.filter((e) => typeof e?.event_type === 'string' && CRM_EVENTS[e.event_type]);
}

// ── Steps 5-6: normalise + dedup ─────────────────────────────────────────────

/** dedup_key = account + signal type + 5-minute bucket (same account+type within 5 min = one signal). */
export function computeDedupKey(accountId: string, signalType: string, occurredAtMs: number): string {
  return `${accountId}:${signalType}:${Math.floor(occurredAtMs / 300_000)}`;
}

/** Redis 5-minute dedup window. Returns true if FRESH (process it), false if a recent duplicate. */
export async function dedupFresh(workspaceId: string, dedupKey: string): Promise<boolean> {
  try {
    const res = await getRedisConnection().set(`dedup:${workspaceId}:${dedupKey}`, '1', 'EX', 300, 'NX');
    return res === 'OK';
  } catch {
    return true; // Redis down → don't block; the DB unique constraint is the durable backstop
  }
}

// ── Contact attribution (from contacts.mapped, cached in Redis) ──────────────

export async function setAccountAttribution(workspaceId: string, accountId: string, primaryContactId: string | null): Promise<void> {
  if (!primaryContactId) return;
  try {
    await getRedisConnection().set(`attr:${workspaceId}:${accountId}`, primaryContactId, 'EX', 60 * 60 * 24 * 30);
  } catch { /* attribution is best-effort */ }
}

async function getAttributedContact(workspaceId: string, accountId: string): Promise<string | null> {
  try {
    return await getRedisConnection().get(`attr:${workspaceId}:${accountId}`);
  } catch {
    return null;
  }
}

// ── Persistence (idempotent on (workspace_id, dedup_key)) ────────────────────

function toPayload(s: { accountId: string; contactId: string | null; signalType: string; signalSource: string; pointsAwarded: number; decayRatePerWeek: number; pageUrl: string | null; metadata: unknown; dedupKey: string; occurredAt: Date; receivedAt: Date }): SignalReceivedPayload {
  return {
    account_id: s.accountId,
    contact_id: s.contactId,
    signal_type: s.signalType,
    signal_source: s.signalSource,
    points_awarded: s.pointsAwarded,
    decay_rate_per_week: s.decayRatePerWeek,
    page_url: s.pageUrl,
    metadata: (s.metadata ?? {}) as SignalReceivedPayload['metadata'],
    dedup_key: s.dedupKey,
    occurred_at: s.occurredAt.toISOString(),
    received_at: s.receivedAt.toISOString(),
  };
}

/** Insert a signal; returns isNew=false when the dedup_key already exists (cache-miss dup). */
export async function storeSignal(workspaceId: string, n: NormalisedSignal): Promise<{ payload: SignalReceivedPayload; isNew: boolean }> {
  try {
    const row = await prisma.signal.create({
      data: {
        workspaceId, accountId: n.accountId, contactId: n.contactId, signalType: n.signalType,
        signalSource: n.signalSource, pointsAwarded: n.pointsAwarded, decayRatePerWeek: n.decayRatePerWeek,
        pageUrl: n.pageUrl, metadata: n.metadata as Prisma.InputJsonValue, dedupKey: n.dedupKey, occurredAt: new Date(n.occurredAt),
      },
    });
    return { payload: toPayload(row), isNew: true };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      const row = await prisma.signal.findUnique({ where: { workspaceId_dedupKey: { workspaceId, dedupKey: n.dedupKey } } });
      if (row) return { payload: toPayload(row), isNew: false };
    }
    throw e;
  }
}

// ── Read side: decayed rolling score + timelines ─────────────────────────────

function decayedValue(points: number, decayPerWeek: number, occurredAt: Date, now: number): number {
  // Defensive: clamp decay to [0, 1) and fall back to 0.5 for a non-finite value
  // so a bad row can never poison a rolling score with NaN/negative output.
  const decay = Number.isFinite(decayPerWeek) ? Math.min(0.9999, Math.max(0, decayPerWeek)) : 0.5;
  const weeks = Math.max(0, (now - occurredAt.getTime()) / (7 * 24 * 3600 * 1000));
  return points * Math.pow(1 - decay, weeks);
}

export async function getAccountSignalScore(workspaceId: string, accountId: string): Promise<number> {
  const rows = await prisma.signal.findMany({ where: { workspaceId, accountId }, select: { pointsAwarded: true, decayRatePerWeek: true, occurredAt: true } });
  const now = Date.now();
  return Math.round(rows.reduce((sum, r) => sum + decayedValue(r.pointsAwarded, r.decayRatePerWeek, r.occurredAt, now), 0));
}

export async function getSignalsForAccount(workspaceId: string, accountId: string) {
  const rows = await prisma.signal.findMany({ where: { workspaceId, accountId }, orderBy: { occurredAt: 'desc' }, take: 100 });
  const now = Date.now();
  return {
    account_id: accountId,
    rolling_score: await getAccountSignalScore(workspaceId, accountId),
    signals: rows.map((r) => ({
      id: r.id, signal_type: r.signalType, signal_source: r.signalSource, points_awarded: r.pointsAwarded,
      current_value: Math.round(decayedValue(r.pointsAwarded, r.decayRatePerWeek, r.occurredAt, now) * 10) / 10,
      page_url: r.pageUrl, contact_id: r.contactId, occurred_at: r.occurredAt.toISOString(),
    })),
  };
}

/** Recent signals across the workspace (the global feed on /signals). */
export async function getRecentSignals(workspaceId: string, limit = 50) {
  const rows = await prisma.signal.findMany({ where: { workspaceId }, orderBy: { occurredAt: 'desc' }, take: limit });
  const accountIds = [...new Set(rows.map((r) => r.accountId))];
  const accts = await prisma.talAccount.findMany({ where: { workspaceId, accountId: { in: accountIds } }, select: { accountId: true, name: true, domain: true } });
  const nameMap = new Map(accts.map((a) => [a.accountId, a]));
  return rows.map((r) => ({
    id: r.id, account_id: r.accountId, account_name: nameMap.get(r.accountId)?.name ?? null,
    signal_type: r.signalType, signal_source: r.signalSource, points_awarded: r.pointsAwarded,
    page_url: r.pageUrl, occurred_at: r.occurredAt.toISOString(),
  }));
}

// ── Orchestrators ────────────────────────────────────────────────────────────

/** Shared tail: dedup → store → return a publish-ready result (caller publishes + checks). */
async function ingestNormalised(workspaceId: string, n: NormalisedSignal): Promise<IngestResult> {
  const fresh = await dedupFresh(workspaceId, n.dedupKey);
  if (!fresh) return { status: 'duplicate', dedupKey: n.dedupKey };
  const { payload, isNew } = await storeSignal(workspaceId, n);
  if (!isNew) return { status: 'duplicate', dedupKey: n.dedupKey };
  return { status: 'published', payload };
}

/** Website tracking-snippet intake. */
export async function buildTrackingSignal(workspaceId: string, hit: TrackingHit): Promise<IngestResult> {
  if (isBot(hit.userAgent)) return { status: 'discarded', reason: 'bot traffic' };

  const match = await resolveHitToAccount(workspaceId, { ip: hit.ip, sessionId: hit.sessionId, domain: hit.domain, accountId: hit.accountId });
  if (!match) return { status: 'discarded', reason: 'no TAL account matched' };

  const intent = classifyPageIntent(hit.url);
  const occurredAt = hit.occurredAt ?? new Date().toISOString();
  const contactId = await getAttributedContact(workspaceId, match.accountId);
  const n: NormalisedSignal = {
    accountId: match.accountId,
    contactId,
    signalType: intent.signalType,
    signalSource: 'website',
    pointsAwarded: intent.pointsAwarded,
    decayRatePerWeek: intent.decayRatePerWeek,
    pageUrl: hit.url,
    metadata: { session_id: hit.sessionId, domain: match.domain },
    dedupKey: computeDedupKey(match.accountId, intent.signalType, new Date(occurredAt).getTime()),
    occurredAt,
  };
  return ingestNormalised(workspaceId, n);
}

/** Map one verified CRM/email webhook event to a normalised signal + ingest. */
export async function buildWebhookSignal(workspaceId: string, source: string, ev: RawCrmEvent): Promise<IngestResult> {
  const spec = ev.event_type ? CRM_EVENTS[ev.event_type] : undefined;
  if (!spec) return { status: 'discarded', reason: `unknown event_type ${ev.event_type}` };

  const match = await resolveHitToAccount(workspaceId, { ip: 'webhook', sessionId: `wh_${ev.account_id ?? ev.domain ?? ev.email ?? 'x'}`, domain: ev.domain ?? (ev.email?.split('@')[1] ?? null), accountId: ev.account_id ?? null });
  if (!match) return { status: 'discarded', reason: 'no TAL account matched' };

  const occurredAt = ev.occurred_at ?? new Date().toISOString();
  const contactId = await getAttributedContact(workspaceId, match.accountId);
  const n: NormalisedSignal = {
    accountId: match.accountId,
    contactId,
    signalType: spec.type,
    signalSource: source === 'outreach' ? 'email_webhook' : 'crm_webhook',
    pointsAwarded: spec.points,
    decayRatePerWeek: spec.decay,
    pageUrl: ev.url ?? null,
    metadata: { email: ev.email ?? null, raw_event: ev.event_type },
    dedupKey: computeDedupKey(match.accountId, spec.type, new Date(occurredAt).getTime()),
    occurredAt,
  };
  return ingestNormalised(workspaceId, n);
}

export async function logWebhook(workspaceId: string | null, source: string, payload: unknown, signatureValid: boolean): Promise<void> {
  await prisma.webhookLog.create({ data: { workspaceId, source, payload: payload as Prisma.InputJsonValue, signatureValid } });
}
