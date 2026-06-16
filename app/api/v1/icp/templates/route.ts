/**
 * GET /api/v1/icp/templates — industry benchmark templates to seed the wizard.
 * Public reference data; no workspace data is returned.
 */

import { ICP_TEMPLATES } from '@/lib/engines/icp-engine/templates';
import { ok } from '@/lib/http/respond';

export async function GET() {
  return ok(ICP_TEMPLATES);
}
