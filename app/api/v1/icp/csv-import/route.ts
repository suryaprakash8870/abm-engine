/**
 * POST /api/v1/icp/csv-import — Mode C.
 *
 * The CSV is parsed in the browser and sent as { rows, field_mapping }. We map
 * rows → normalised deals and queue the SAME analysis pipeline as Mode B. If there
 * are too few closed-won rows, we steer the user to the wizard (Mode A).
 */

import { resolveWorkspaceId } from '@/lib/auth/workspace';
import { csvImportSchema } from '@/lib/engines/icp-engine/types';
import { mapCsvRowsToDeals, MIN_WON_DEALS } from '@/lib/engines/icp-engine/analysis';
import { startCsvAnalysis } from '@/lib/engines/icp-engine/analysis-queue';
import { ok, fail, handleRouteError } from '@/lib/http/respond';

export async function POST(req: Request) {
  try {
    const workspaceId = resolveWorkspaceId(req);

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return fail('VALIDATION_ERROR', 'Request body must be valid JSON.');
    }

    const parsed = csvImportSchema.safeParse(body);
    if (!parsed.success) {
      return fail('VALIDATION_ERROR', 'Expected { rows, field_mapping }.', parsed.error.flatten());
    }

    const deals = mapCsvRowsToDeals(parsed.data.rows, parsed.data.field_mapping);
    const wonCount = deals.filter((d) => d.outcome === 'won').length;
    if (wonCount < MIN_WON_DEALS) {
      return fail(
        'VALIDATION_ERROR',
        `Only ${wonCount} closed-won rows found (need at least ${MIN_WON_DEALS}). Use the wizard (Mode A) instead.`,
      );
    }

    const { jobId } = await startCsvAnalysis(workspaceId, deals);
    return ok({ job_id: jobId, status: 'processing', deals_parsed: deals.length }, 202);
  } catch (e) {
    return handleRouteError(e);
  }
}
