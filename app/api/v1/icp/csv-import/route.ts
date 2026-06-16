/**
 * POST /api/v1/icp/csv-import — Mode C (CSV import). NOT YET IMPLEMENTED.
 * Follow-up: upload a CRM export, map fields, then reuse the Mode B pipeline.
 */

import { NextResponse } from 'next/server';

export function POST() {
  return NextResponse.json(
    { error: { code: 'NOT_IMPLEMENTED', message: 'Mode C (CSV import) is coming soon. Use the wizard (Mode A) for now.' } },
    { status: 501 },
  );
}
