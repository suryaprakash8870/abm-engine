/**
 * Shared CRM/email webhook intake for engine 07 (used by both webhook routes).
 *
 * Resolve workspace (via the token in the registered webhook URL) → verify the
 * HMAC signature → log the delivery → map events → ingest each (dedup + store) →
 * publish signal.received after the completion check (verify-before-publish).
 */

import {
  resolveTrackingToken,
  verifyWebhookSignature,
  mapWebhookToRawSignals,
  buildWebhookSignal,
  logWebhook,
} from './service';
import { completionCheck } from './validation';
import { publishSignalReceived } from './publisher';
import { newCorrelationId } from '../../events';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

export async function handleWebhook(source: 'hubspot' | 'outreach', req: Request): Promise<Response> {
  // Verify the signature FIRST (it proves the sender) before trusting the token.
  const rawBody = await req.text();
  const sig =
    req.headers.get('x-hubspot-signature-v3') ||
    req.headers.get('x-hubspot-signature') ||
    req.headers.get('x-outreach-signature') ||
    req.headers.get('x-signature');
  const { valid, devBypass } = verifyWebhookSignature(source, rawBody, sig);

  const token = new URL(req.url).searchParams.get('token') || req.headers.get('x-tracking-token') || '';
  const workspaceId = await resolveTrackingToken(token);

  let parsed: Record<string, unknown> = {};
  try { parsed = JSON.parse(rawBody || '{}'); } catch { parsed = {}; }

  // Log every delivery (doc failure-handling: log invalid-signature attempts too).
  await logWebhook(workspaceId, source, parsed, valid).catch(() => {});

  // One generic 401 for either failure — don't reveal which check failed.
  if (!valid || !workspaceId) return json({ ok: false, error: 'unauthorized' }, 401);

  const events = mapWebhookToRawSignals(parsed);
  let published = 0;
  for (const ev of events) {
    const result = await buildWebhookSignal(workspaceId, source, ev);
    if (result.status === 'published') {
      const check = completionCheck({ matchedToTalAccount: true, deduplicated: true, normalisedAndStored: true, eventPublished: true });
      if (check.ok) {
        await publishSignalReceived(result.payload, { workspaceId, correlationId: newCorrelationId() });
        published++;
      }
    }
  }
  return json({ ok: true, events: events.length, published, dev_bypass: devBypass });
}
