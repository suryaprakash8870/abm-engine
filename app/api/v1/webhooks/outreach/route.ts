/** POST /api/v1/webhooks/outreach?token=<tracking-token> — Outreach webhook receiver. */

import { handleWebhook } from '@/lib/engines/signal-engine/webhook-intake';

export function POST(req: Request) {
  return handleWebhook('outreach', req);
}
