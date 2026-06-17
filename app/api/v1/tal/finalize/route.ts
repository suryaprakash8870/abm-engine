/**
 * POST /api/v1/tal/finalize — manually (re)build + publish the TAL from the
 * workspace's current scored accounts. The automatic path is the accounts.scored
 * handler; this is the user-triggered equivalent.
 */

import { resolveWorkspaceId } from '@/lib/auth/workspace';
import { newCorrelationId } from '@/lib/events';
import { finalizeTal } from '@/lib/engines/tal-manager/service';
import { completionCheck } from '@/lib/engines/tal-manager/validation';
import { publishTalFinalized } from '@/lib/engines/tal-manager/publisher';
import { ok, handleRouteError } from '@/lib/http/respond';

export async function POST(req: Request) {
  try {
    const workspaceId = resolveWorkspaceId(req);
    const correlationId = newCorrelationId();

    const result = await finalizeTal(workspaceId, { correlationId });

    const check = completionCheck({
      suppressionApplied: result.suppressionApplied,
      talVersionCreated: result.talVersionCreated,
      crmPropertiesAndListsWritten: result.crmRequested,
      finalizedEventPublished: true,
    });
    if (!check.ok) throw new Error(`TAL completion check failed: ${check.failed.join('; ')}`);

    await publishTalFinalized(
      {
        tal_id: result.talId,
        version: result.versionNumber,
        version_number: result.versionNumber,
        account_count: result.accountCount,
        tier1_count: result.tier1Count,
        tier2_count: result.tier2Count,
        tier3_count: result.tier3Count,
        status: result.status,
        review_status: result.reviewStatus,
        suppressed_count: result.suppressedCount,
        finalized_at: new Date().toISOString(),
      },
      { workspaceId, correlationId },
    );

    return ok({
      tal_id: result.talId,
      version: result.versionNumber,
      account_count: result.accountCount,
      tier1_count: result.tier1Count,
      tier2_count: result.tier2Count,
      tier3_count: result.tier3Count,
      suppressed_count: result.suppressedCount,
      review_status: result.reviewStatus,
    });
  } catch (e) {
    return handleRouteError(e);
  }
}
