/**
 * POST /api/v1/scoring/override
 * Manual tier override — user override always wins, reason required.
 */

import { resolveWorkspaceId } from '@/lib/auth/workspace';
import { applyTierOverride } from '@/lib/engines/scoring-engine/service';
import { ok, fail, handleRouteError } from '@/lib/http/respond';
import type { Tier } from '@/lib/events';

export async function POST(req: Request) {
  try {
    const workspaceId = resolveWorkspaceId(req);
    const body = await req.json().catch(() => ({})) as {
      account_id?: string;
      tier?: number;
      reason?: string;
      overridden_by?: string;
    };

    if (!body.account_id) return fail('VALIDATION_ERROR', 'account_id is required.');
    if (![1, 2, 3].includes(body.tier ?? 0)) return fail('VALIDATION_ERROR', 'tier must be 1, 2, or 3.');
    if (!body.reason?.trim()) return fail('VALIDATION_ERROR', 'reason is required for a tier override.');

    await applyTierOverride(
      workspaceId,
      body.account_id,
      body.tier as Tier,
      body.reason,
      body.overridden_by ?? 'user',
    );

    return ok({ ok: true });
  } catch (e) {
    return handleRouteError(e);
  }
}
