/**
 * GET /api/v1/demand-gen-orchestrator/health
 *
 * Health probe for Engine 09. Returns the engine's HealthStatus
 * ({ status, version, db_connected, queue_connected, last_event_processed_at }).
 */

import { NextResponse } from 'next/server';
import engine from '@/lib/engines/demand-gen-orchestrator';

export async function GET() {
  return NextResponse.json({ data: await engine.health() });
}
