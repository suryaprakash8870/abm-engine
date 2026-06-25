/**
 * GET /api/v1/pipeline/status
 *
 * One call that returns a live status line for every one of the 11 engines for
 * the caller's workspace — the data behind the Pipeline canvas (/pipeline).
 *
 * Each engine reports only against its OWN tables (no cross-engine reads): a
 * primary count, an optional secondary highlight, and whether it has run yet.
 * All counts run in parallel.
 */

import { resolveWorkspaceId } from '@/lib/auth/workspace';
import { prisma } from '@/lib/db/client';
import { ok, handleRouteError } from '@/lib/http/respond';

export interface EngineStatus {
  num: string;       // '01' .. '11'
  slug: string;      // matches the page route key
  count: number;     // primary metric
  label: string;     // primary metric label, e.g. "accounts"
  highlight: string | null; // secondary stat, e.g. "47 hot" or "connected"
  href: string;      // where clicking the node goes
  active: boolean;   // has this engine produced anything yet?
}

export async function GET(req: Request) {
  try {
    const workspaceId = resolveWorkspaceId(req);
    const where = { workspaceId };

    const [
      icpCount,
      tamCount,
      enrichedCount,
      qualifiedCount,
      scoredCount,
      tier1Count,
      tal,
      contactCount,
      signalCount,
      awarenessCount,
      hotCount,
      playsCount,
      crmConn,
      syncLogCount,
      dealsCount,
    ] = await Promise.all([
      prisma.icpDefinition.count({ where }),
      prisma.rawAccount.count({ where }),
      prisma.enrichedAccount.count({ where }),
      prisma.qualificationResult.count({ where: { workspaceId, qualified: true } }),
      prisma.accountScore.count({ where }),
      prisma.accountScore.count({ where: { workspaceId, tier: 1 } }),
      prisma.targetAccountList.findUnique({ where: { workspaceId }, select: { accountCount: true, version: true } }),
      prisma.contact.count({ where }),
      prisma.signal.count({ where }),
      prisma.awarenessScore.count({ where }),
      prisma.awarenessScore.count({ where: { workspaceId, currentScore: { gte: 60 } } }),
      prisma.playsLog.count({ where }),
      prisma.crmConnection.findFirst({ where: { workspaceId, isActive: true }, select: { crmType: true } }),
      prisma.syncLog.count({ where }),
      prisma.winLossAnalysis.count({ where }),
    ]);

    const engines: EngineStatus[] = [
      { num: '01', slug: 'icp',        count: icpCount,        label: 'ICP defined',  highlight: icpCount > 0 ? 'active' : null,                href: '/icp',          active: icpCount > 0 },
      { num: '02', slug: 'tam',        count: tamCount,        label: 'companies',    highlight: null,                                          href: '/tal',          active: tamCount > 0 },
      { num: '03', slug: 'enrichment', count: enrichedCount,   label: 'enriched',     highlight: qualifiedCount > 0 ? `${qualifiedCount} qualified` : null, href: '/tal', active: enrichedCount > 0 },
      { num: '04', slug: 'scoring',    count: scoredCount,     label: 'scored',       highlight: tier1Count > 0 ? `${tier1Count} Tier 1` : null, href: '/scoring',      active: scoredCount > 0 },
      { num: '05', slug: 'tal',        count: tal?.accountCount ?? 0, label: 'on TAL', highlight: tal ? `v${tal.version}` : null,               href: '/tal',          active: !!tal && (tal.accountCount ?? 0) > 0 },
      { num: '06', slug: 'contacts',   count: contactCount,    label: 'contacts',     highlight: null,                                          href: '/contacts',     active: contactCount > 0 },
      { num: '07', slug: 'signals',    count: signalCount,     label: 'signals',      highlight: null,                                          href: '/signals',      active: signalCount > 0 },
      { num: '08', slug: 'awareness',  count: awarenessCount,  label: 'scored',       highlight: hotCount > 0 ? `${hotCount} hot` : null,       href: '/awareness',    active: awarenessCount > 0 },
      { num: '09', slug: 'plays',      count: playsCount,      label: 'plays fired',  highlight: null,                                          href: '/plays',        active: playsCount > 0 },
      { num: '10', slug: 'crm',        count: syncLogCount,    label: 'CRM writes',   highlight: crmConn ? `${crmConn.crmType} connected` : 'not connected', href: '/integrations', active: !!crmConn },
      { num: '11', slug: 'flywheel',   count: dealsCount,      label: 'deals closed', highlight: null,                                          href: '/insights',     active: dealsCount > 0 },
    ];

    const activeCount = engines.filter((e) => e.active).length;
    return ok({ engines, activeCount, total: engines.length });
  } catch (e) {
    return handleRouteError(e);
  }
}
