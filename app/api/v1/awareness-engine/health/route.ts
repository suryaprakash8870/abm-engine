/**
 * GET /api/v1/awareness-engine/health
 *
 * Health probe for engine 08 (Awareness Engine). Delegates to engine.health()
 * which best-effort pings Postgres + Redis. See lib/engines/awareness-engine.
 */

import { NextResponse } from 'next/server';
import engine from '@/lib/engines/awareness-engine';

export async function GET() {
  return NextResponse.json({ data: await engine.health() });
}
