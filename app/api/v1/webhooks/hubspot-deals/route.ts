/**
 * POST /api/v1/webhooks/hubspot-deals — inbound deal-stage webhook.
 *
 * Parses a CRM deal-stage change and publishes the critical feedback loop:
 * crm.deal_closed_won / crm.deal_closed_lost (consumed by GTM Flywheel + ICP).
 *
 * Security: verify the HubSpot HMAC signature (HUBSPOT_WEBHOOK_SECRET); resolve the
 * workspace from the deal's portalId → connection mapping (the ?ws= hint is only a
 * dev fallback when no secret/portal is configured). De-duplicated on (deal,
 * resolution) so a re-delivered webhook can't double-count revenue.
 */

import {
  parseInboundDealWebhook, resolveAccountByDomain, verifyDealWebhookSignature, resolveWorkspaceForDeal, markDealProcessed,
} from '@/lib/engines/crm-sync-engine/service';
import { publishCrmDealClosedWon, publishCrmDealClosedLost } from '@/lib/engines/crm-sync-engine/publisher';
import { newCorrelationId } from '@/lib/events';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

export async function POST(req: Request) {
  const rawBody = await req.text();
  const sig = req.headers.get('x-hubspot-signature-v3') || req.headers.get('x-hubspot-signature') || req.headers.get('x-signature');
  const { valid } = verifyDealWebhookSignature(rawBody, sig);
  if (!valid) return json({ ok: false, error: 'invalid signature' }, 401);

  let body: Record<string, unknown> = {};
  try { body = JSON.parse(rawBody || '{}'); } catch { return json({ ok: false, error: 'invalid JSON' }, 400); }

  // Structural validation before touching the feedback loop.
  const dealId = body.deal_id ?? body.dealId ?? body.objectId;
  if (!dealId || typeof body.stage !== 'string' && typeof body.dealstage !== 'string') {
    return json({ ok: false, error: 'deal_id and stage are required' }, 400);
  }

  const wsHint = new URL(req.url).searchParams.get('ws');
  const workspaceId = await resolveWorkspaceForDeal(body.portal_id != null ? String(body.portal_id) : null, wsHint);
  if (!workspaceId) return json({ ok: false, error: 'workspace could not be resolved' }, 400);

  const deal = parseInboundDealWebhook('hubspot', body);
  if (deal.resolution === 'open') return json({ ok: true, resolution: 'open', published: false });

  // Idempotency: a re-delivered webhook for the same (deal, resolution) must not re-publish.
  const fresh = await markDealProcessed(workspaceId, deal.dealId, deal.resolution);
  if (!fresh) return json({ ok: true, resolution: deal.resolution, published: false, deduped: true });

  const accountId = await resolveAccountByDomain(workspaceId, deal.domain);
  const ctx = { workspaceId, correlationId: newCorrelationId() };

  if (deal.resolution === 'won') {
    await publishCrmDealClosedWon(
      { deal_id: deal.dealId, crm_type: deal.crmType, account_id: accountId, domain: deal.domain, amount: deal.amount, stage: deal.stage, closed_at: deal.closedAt, owner_id: deal.ownerId },
      ctx,
    );
  } else {
    await publishCrmDealClosedLost(
      { deal_id: deal.dealId, crm_type: deal.crmType, account_id: accountId, domain: deal.domain, amount: deal.amount, stage: deal.stage, lost_reason: deal.lostReason, closed_at: deal.closedAt, owner_id: deal.ownerId },
      ctx,
    );
  }
  return json({ ok: true, resolution: deal.resolution, account_id: accountId, published: true });
}
