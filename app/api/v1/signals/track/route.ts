/**
 * POST /api/v1/signals/track — public website tracking-snippet intake.
 *
 * PUBLIC: authed by the workspace tracking token (body/header), NOT a session.
 * CORS-open so the snippet can post cross-origin from a customer site. Resolves
 * the visitor to a TAL account, scores + dedups the hit, and publishes
 * signal.received after the completion check passes (verify-before-publish).
 */

import { resolveTrackingToken, buildTrackingSignal } from '@/lib/engines/signal-engine/service';
import { completionCheck } from '@/lib/engines/signal-engine/validation';
import { publishSignalReceived } from '@/lib/engines/signal-engine/publisher';
import { newCorrelationId } from '@/lib/events';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Tracking-Token',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...CORS } });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const token = (body.token as string) || req.headers.get('x-tracking-token') || '';

  const workspaceId = await resolveTrackingToken(token);
  if (!workspaceId) return json({ ok: false }, 200); // never leak token validity to the public endpoint

  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || '0.0.0.0';
  // Cap untrusted fields that reach the DB (defence against row-bloat on a public endpoint).
  const result = await buildTrackingSignal(workspaceId, {
    ip,
    url: String(body.url ?? '').slice(0, 2048),
    sessionId: String(body.session_id ?? body.sessionId ?? 'anon').slice(0, 128),
    userAgent: req.headers.get('user-agent'),
    domain: body.domain ? String(body.domain).slice(0, 253) : null,
    accountId: body.account_id ? String(body.account_id).slice(0, 64) : null,
  });

  if (result.status === 'published') {
    const check = completionCheck({ matchedToTalAccount: true, deduplicated: true, normalisedAndStored: true, eventPublished: true });
    if (check.ok) {
      await publishSignalReceived(result.payload, { workspaceId, correlationId: newCorrelationId() });
    }
  }

  return json({ ok: true, status: result.status });
}
