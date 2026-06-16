/**
 * GET /api/v1/contact-engine/health — health probe for Engine #06 (Contact Engine).
 * Backed by the engine module's `health()` (db + queue connectivity, version).
 */

import { NextResponse } from 'next/server';
import engine from '@/lib/engines/contact-engine';

export async function GET() {
  return NextResponse.json({ data: await engine.health() });
}
