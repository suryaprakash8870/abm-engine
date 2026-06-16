/**
 * Engine 11 — GTM Flywheel · health route.
 *
 * GET /api/v1/gtm-flywheel/health → { status, version, db_connected,
 * queue_connected, last_event_processed_at }. Backed by the engine's own
 * best-effort `health()` probe.
 */

import { NextResponse } from 'next/server';
import engine from '@/lib/engines/gtm-flywheel';

export async function GET() {
  return NextResponse.json({ data: await engine.health() });
}
