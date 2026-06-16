/**
 * GET /api/v1/crm-sync-engine/health
 *
 * Health probe for engine 10 (CRM Sync Engine). Delegates to engine.health()
 * which best-effort pings Postgres + Redis. See lib/engines/crm-sync-engine.
 */

import { NextResponse } from 'next/server';
import engine from '@/lib/engines/crm-sync-engine';

export async function GET() {
  return NextResponse.json({ data: await engine.health() });
}
