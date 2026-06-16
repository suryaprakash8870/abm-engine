/**
 * Signal Engine — core service logic.
 *
 * Implements the engine-07 "Step-by-step job" as composable, typed function
 * stubs. Bodies are intentionally `// TODO(owner)` so the owner can fill them in;
 * Prisma models are referenced ONLY in comments (the models do not exist yet).
 *
 * Owned tables (see prisma/schema/signal-engine.prisma):
 *   signals, signal_sources, webhook_log, tracking_tokens, visitor_sessions
 *
 * Step-by-step job (engine-07 doc):
 *   1. Listen continuously to: JS snippet, CRM webhooks, email-sequence webhooks,
 *      scheduled 3rd-party polls
 *   2. Website snippet: IP + URL + session → resolve IP to company (RB2B) → match
 *      to a TAL account
 *   3. Detect high-intent pages (pricing, demo, comparison, ROI) → higher points
 *   4. CRM webhooks (deal stage, opens/clicks/replies): verify signatures, map to
 *      the signal schema
 *   5. Normalise every signal to a common schema regardless of source
 *   6. Deduplicate via a 5-minute Redis window (same account + signal type)
 *   7. Poll 3rd-party APIs daily (PredictLeads hiring, Crunchbase funding) — v2
 *   8. Publish `signal.received` for every valid, deduplicated signal
 */

import type { SignalReceivedPayload } from '../../events';

// ─────────────────────────────────────────────────────────────────────────────
// Common types used across the pipeline
// ─────────────────────────────────────────────────────────────────────────────

/** Where a raw signal entered the system. */
export type SignalSourceType = 'website' | 'crm_webhook' | 'email_webhook' | 'third_party_poll';

/** A raw signal as received from any source, pre-normalisation. */
export interface RawSignal {
  sourceType: SignalSourceType;
  source: string;
  payload: Record<string, unknown>;
  receivedAt: string;
}

/** A signal normalised to the common schema, before dedup + persistence. */
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
  receivedAt: string;
}

/** Website tracking-snippet intake (IP + URL + session). */
export interface TrackingHit {
  workspaceId: string;
  token: string;
  ip: string;
  url: string;
  sessionId: string;
  userAgent: string | null;
}

/** A CRM/email webhook envelope as delivered to our receiver. */
export interface WebhookDelivery {
  source: string;
  signatureHeader: string | null;
  rawBody: string;
  parsedBody: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 2 — Website snippet: resolve IP to company and match to a TAL account
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolve a visitor IP to a company domain via RB2B (Clearbit Reveal fallback).
 * Returns null when the company cannot be identified (signal is then discarded).
 *
 * Prisma: upsert `visitor_sessions` (session_id, account_id, ip_hash, first/last seen).
 */
export async function resolveIpToAccount(_hit: TrackingHit): Promise<string | null> {
  // TODO(owner): call RB2B → domain; fall back to Clearbit Reveal; match domain
  // to a TAL account_id; record/update visitor_sessions. Discard on no match.
  throw new Error('signal-engine.resolveIpToAccount not implemented');
}

/**
 * Step 3 — classify a page URL and award points. High-intent pages (pricing,
 * demo, comparison, ROI calculator) earn higher points than generic pageviews.
 * Returns the signal type + base points + per-week decay rate.
 */
export function classifyPageIntent(_url: string): {
  signalType: string;
  pointsAwarded: number;
  decayRatePerWeek: number;
} {
  // TODO(owner): regex/allowlist match pricing|demo|comparison|roi → high points;
  // everything else → low-points generic pageview. Set decay_rate_per_week.
  throw new Error('signal-engine.classifyPageIntent not implemented');
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 4 — CRM / email webhooks: verify signature, map to the signal schema
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Verify a webhook signature (HubSpot/Outreach). Returns whether the signature
 * is valid; the receiver returns 401 + logs the attempt when it is not.
 *
 * Prisma: insert `webhook_log` (source, payload, signature_valid, processed_at).
 */
export async function verifyWebhookSignature(_delivery: WebhookDelivery): Promise<boolean> {
  // TODO(owner): compute HMAC over rawBody with the source's secret; constant-time
  // compare against signatureHeader. Log every delivery to webhook_log.
  throw new Error('signal-engine.verifyWebhookSignature not implemented');
}

/**
 * Map a verified CRM/email webhook into one or more raw signals (deal stage
 * change, email open/click/reply, etc.).
 */
export async function mapWebhookToRawSignals(_delivery: WebhookDelivery): Promise<RawSignal[]> {
  // TODO(owner): translate provider-specific events into RawSignal[]; attribute
  // contact_id where the webhook carries an email/contact identity.
  throw new Error('signal-engine.mapWebhookToRawSignals not implemented');
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 5 — Normalise every signal to the common schema regardless of source
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Normalise any raw signal (website, CRM, email, 3rd-party) into the common
 * NormalisedSignal schema. Computes the deterministic `dedup_key` from
 * account_id + signal_type (+ a coarse time bucket) used by the dedup window.
 */
export async function normaliseSignal(
  _raw: RawSignal,
  _accountId: string,
  _contactId: string | null,
): Promise<NormalisedSignal> {
  // TODO(owner): build NormalisedSignal; compute dedup_key; set points + decay.
  throw new Error('signal-engine.normaliseSignal not implemented');
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 6 — Deduplicate via a 5-minute Redis window (same account + signal type)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns true if this dedup_key is NEW within the 5-minute window (i.e. the
 * signal should be processed), false if it is a duplicate to drop.
 *
 * Implementation: Redis SET key NX with a 300s TTL (Upstash dedup cache). The
 * idempotency key on the `signals` record is the durable backstop on cache miss.
 */
export async function isFreshWithinDedupWindow(_dedupKey: string): Promise<boolean> {
  // TODO(owner): SET dedup:{key} 1 NX EX 300 on the Upstash dedup connection.
  throw new Error('signal-engine.isFreshWithinDedupWindow not implemented');
}

// ─────────────────────────────────────────────────────────────────────────────
// Persistence — store the normalised signal (idempotent on dedup_key)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Persist a normalised signal to the `signals` table. The unique idempotency key
 * (dedup_key) prevents double-counting even on a dedup-cache miss. Returns the
 * `signal.received` payload to publish.
 *
 * Prisma: insert into `signals` (id, workspace_id, account_id, contact_id,
 * signal_type, signal_source, points_awarded, decay_rate_per_week, page_url,
 * metadata, dedup_key, occurred_at, received_at) — ON CONFLICT(dedup_key) DO NOTHING.
 */
export async function storeSignal(
  _workspaceId: string,
  _signal: NormalisedSignal,
): Promise<SignalReceivedPayload> {
  // TODO(owner): insert into signals (idempotent on dedup_key); return payload.
  throw new Error('signal-engine.storeSignal not implemented');
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 1 / 7 — source registration and scheduled 3rd-party polls (v2)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * List active signal sources for a workspace.
 * Prisma: select from `signal_sources` where workspace_id = ? and is_active.
 */
export async function listActiveSignalSources(_workspaceId: string): Promise<unknown[]> {
  // TODO(owner): query signal_sources (source_type, config, is_active).
  throw new Error('signal-engine.listActiveSignalSources not implemented');
}

/**
 * Step 7 (v2) — poll 3rd-party APIs daily for hiring (PredictLeads) and funding
 * (Crunchbase) signals, classify relevance (Claude Haiku 4.5), emit raw signals.
 */
export async function pollThirdPartySources(_workspaceId: string): Promise<RawSignal[]> {
  // TODO(owner): v2 — PredictLeads + Crunchbase polls; Haiku job-posting/funding
  // relevance classification; return RawSignal[].
  throw new Error('signal-engine.pollThirdPartySources not implemented');
}

/**
 * Validate a workspace tracking token (snippet auth) and return its workspace_id.
 * Prisma: select from `tracking_tokens` where token = ?.
 */
export async function resolveTrackingToken(_token: string): Promise<string | null> {
  // TODO(owner): look up tracking_tokens; return workspace_id or null.
  throw new Error('signal-engine.resolveTrackingToken not implemented');
}
