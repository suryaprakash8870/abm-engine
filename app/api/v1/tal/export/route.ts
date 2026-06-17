/** GET /api/v1/tal/export — download the current TAL as a CSV file. */

import { resolveWorkspaceId } from '@/lib/auth/workspace';
import { exportTalCsv } from '@/lib/engines/tal-manager/service';
import { handleRouteError } from '@/lib/http/respond';

export async function GET(req: Request) {
  try {
    const workspaceId = resolveWorkspaceId(req);
    const csv = await exportTalCsv(workspaceId);
    return new Response(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="target-account-list.csv"',
      },
    });
  } catch (e) {
    return handleRouteError(e);
  }
}
