/**
 * GET /api/v1/scoring-engine/health
 *
 * Liveness probe for engine 04. Delegates to the EngineModule's best-effort
 * `health()` (Postgres + Redis ping inside try/catch).
 *
 * @see ../../../../../docs/engines/engine-04-scoring-engine.md
 */

import { NextResponse } from 'next/server';
import engine from '@/lib/engines/scoring-engine';

export async function GET() {
  return NextResponse.json({ data: await engine.health() });
}
