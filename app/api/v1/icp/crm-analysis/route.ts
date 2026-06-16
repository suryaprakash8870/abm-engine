/**
 * POST /api/v1/icp/crm-analysis — Mode B (CRM analysis). NOT YET IMPLEMENTED.
 * Follow-up: OAuth pull of closed-won/lost deals → statistical comparison →
 * Claude Sonnet interpretation → same structured ICP as Mode A.
 */

import { NextResponse } from 'next/server';

export function POST() {
  return NextResponse.json(
    { error: { code: 'NOT_IMPLEMENTED', message: 'Mode B (CRM analysis) is coming soon. Use the wizard (Mode A) for now.' } },
    { status: 501 },
  );
}
