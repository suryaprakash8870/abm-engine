/**
 * GET /api/v1/tal-manager/health — health probe for Engine #05 (TAL Manager).
 * Backed by the engine module's `health()` (db + queue connectivity, version).
 */

import { NextResponse } from 'next/server';
import engine from '@/lib/engines/tal-manager';

export async function GET() {
  return NextResponse.json({ data: await engine.health() });
}
