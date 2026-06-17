/**
 * POST /api/v1/tam/upload — Mode: user-uploaded company list (Apollo web export, etc.).
 *
 * The CSV is parsed in the browser and sent as { rows, field_mapping }. We map to
 * account refs and ingest them as a TAM build (source: csv_upload), which flows
 * through the same enrichment pipeline. Body: { icp_id, rows, field_mapping }.
 */

import { z } from 'zod';
import { resolveWorkspaceId } from '@/lib/auth/workspace';
import { newCorrelationId } from '@/lib/events';
import { mapCsvRowsToAccounts } from '@/lib/engines/tam-builder/csv';
import { ingestCsvAccounts } from '@/lib/engines/tam-builder/service';
import { ok, fail, handleRouteError } from '@/lib/http/respond';

const schema = z.object({
  icp_id: z.string().min(1),
  rows: z.array(z.record(z.string(), z.string())).min(1),
  field_mapping: z.object({ domain: z.string().min(1), name: z.string().optional() }),
});

export async function POST(req: Request) {
  try {
    const workspaceId = resolveWorkspaceId(req);

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return fail('VALIDATION_ERROR', 'Request body must be valid JSON.');
    }
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return fail('VALIDATION_ERROR', 'Expected { icp_id, rows, field_mapping }.', parsed.error.flatten());
    }

    const accounts = mapCsvRowsToAccounts(parsed.data.rows, parsed.data.field_mapping);
    if (accounts.length === 0) {
      return fail('VALIDATION_ERROR', 'No valid company domains found in the mapped column.');
    }

    const { jobId, total } = await ingestCsvAccounts({
      workspaceId,
      icpId: parsed.data.icp_id,
      accounts,
      correlationId: newCorrelationId(),
    });
    return ok({ job_id: jobId, total, status: 'processing' }, 202);
  } catch (e) {
    return handleRouteError(e);
  }
}
