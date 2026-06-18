/** POST /api/v1/webhooks/hubspot?token=<tracking-token> — HubSpot webhook receiver. */

import { handleWebhook } from '@/lib/engines/signal-engine/webhook-intake';

export function POST(req: Request) {
  return handleWebhook('hubspot', req);
}
