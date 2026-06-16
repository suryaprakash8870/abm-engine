/**
 * GET /api/v1/tam-builder/health
 *
 * Health probe for engine 02 (TAM Builder). Returns the engine's HealthStatus:
 * { status, version, db_connected, queue_connected, last_event_processed_at }.
 *
 * See docs/engines/engine-02-tam-builder.md.
 */

import { NextResponse } from 'next/server';
import engine from '@/lib/engines/tam-builder';

export async function GET() {
  return NextResponse.json({ data: await engine.health() });
}
