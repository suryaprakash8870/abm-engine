/**
 * GET /api/v1/signal-engine/health
 *
 * Liveness probe for engine 07. Delegates to the EngineModule's best-effort
 * `health()` (Postgres + Redis ping inside try/catch).
 *
 * @see ../../../../../docs/engines/engine-07-signal-engine.md
 */

import { NextResponse } from 'next/server';
import engine from '@/lib/engines/signal-engine';

export async function GET() {
  return NextResponse.json({ data: await engine.health() });
}
