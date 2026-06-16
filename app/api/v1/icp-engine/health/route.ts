/**
 * Health probe for the ICP Engine.
 * GET /api/v1/icp-engine/health → { data: HealthStatus }
 */

import { NextResponse } from 'next/server';
import engine from '@/lib/engines/icp-engine';

export async function GET() {
  return NextResponse.json({ data: await engine.health() });
}
