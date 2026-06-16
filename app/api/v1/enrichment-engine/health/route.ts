/**
 * GET /api/v1/enrichment-engine/health
 *
 * Liveness probe for engine 03. Delegates to the EngineModule's best-effort
 * `health()` (Postgres + Redis ping inside try/catch).
 *
 * @see ../../../../../docs/engines/engine-03-enrichment-engine.md
 */

import { NextResponse } from 'next/server';
import engine from '@/lib/engines/enrichment-engine';

export async function GET() {
  return NextResponse.json({ data: await engine.health() });
}
