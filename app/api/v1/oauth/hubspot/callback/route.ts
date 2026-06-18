/**
 * GET /api/v1/oauth/hubspot/callback — HubSpot OAuth redirect target.
 *
 * MVP stub: the mock connect (GET /api/v1/oauth/hubspot) establishes the
 * connection directly, so this just acknowledges. A live build exchanges the
 * `code` query param for tokens here and persists the encrypted connection.
 */

import { ok, handleRouteError } from '@/lib/http/respond';

export async function GET(req: Request) {
  try {
    const code = new URL(req.url).searchParams.get('code');
    return ok({ received: true, has_code: !!code, note: 'MVP mock — connection established via GET /api/v1/oauth/hubspot' });
  } catch (e) {
    return handleRouteError(e);
  }
}
