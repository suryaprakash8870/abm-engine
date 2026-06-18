/**
 * Engine 11 — GTM Flywheel · core service.
 *
 * Closes the learning loop. On a closed deal: record win/loss, walk back the
 * account's signal + play timeline to build multi-touch attribution, recompute
 * pipeline/win-rate by tier, and (every 5th win) recommend an ICP refresh.
 *
 * Owned tables: pipeline_snapshots, attribution_events, win_loss_analysis,
 * flywheel_metrics, signal_correlation_data. Idempotent on deal_id.
 *
 * NOTE (cross-engine reads): attribution reads signals (07) + plays_log (09) and
 * tier from tal_accounts (05) — the established MVP pattern (ADR-013).
 */

import { prisma } from '../../db/client';
import { Prisma } from '@prisma/client';
import type { CrmDealClosedWonPayload, CrmDealClosedLostPayload, FlywheelMetricsUpdatedPayload, IcpRefreshRecommendedPayload, Json } from '../../events';

export const MIN_CORRELATION_DATA_POINTS = 20;
const TIERS = [1, 2, 3] as const;

// ── Win/Loss recording (idempotent on deal_id) ──────────────────────────────

async function tierForAccount(workspaceId: string, accountId: string | null): Promise<number | null> {
  if (!accountId) return null;
  const row = await prisma.talAccount.findFirst({ where: { workspaceId, accountId }, select: { tier: true } });
  return row?.tier ?? null;
}

export async function recordWinLoss(
  workspaceId: string,
  payload: { deal_id: string; account_id: string | null; domain: string; amount: number | null; closed_at: string; owner_id: string | null },
  outcome: 'won' | 'lost',
  daysToClose: number | null,
): Promise<void> {
  const tier = await tierForAccount(workspaceId, payload.account_id);
  const attributes = { tier, domain: payload.domain, days_to_close: daysToClose, owner_id: payload.owner_id } as Prisma.InputJsonValue;
  await prisma.winLossAnalysis.upsert({
    where: { workspaceId_dealId: { workspaceId, dealId: payload.deal_id } },
    create: { workspaceId, dealId: payload.deal_id, accountId: payload.account_id, outcome, amount: payload.amount, accountAttributes: attributes, closedAt: new Date(payload.closed_at) },
    update: { outcome, amount: payload.amount, accountAttributes: attributes, closedAt: new Date(payload.closed_at) },
  });
}

// ── Step 2 — attribution walk-back (signals + plays) ─────────────────────────

interface TouchSummary { touch_type: string; subtype: string | null; occurred_at: string }
export interface AttributionResult {
  deal_id: string;
  account_id: string | null;
  first_touch: TouchSummary | null;
  last_touch: TouchSummary | null;
  linear: Array<{ touch_type: string; subtype: string | null; weight: number }>;
  touch_count: number;
  days_to_close: number | null;
}

export async function buildAttribution(workspaceId: string, payload: CrmDealClosedWonPayload): Promise<AttributionResult> {
  const accountId = payload.account_id;
  const closedAt = new Date(payload.closed_at);
  if (!accountId) {
    return { deal_id: payload.deal_id, account_id: null, first_touch: null, last_touch: null, linear: [], touch_count: 0, days_to_close: null };
  }

  const [signals, plays] = await Promise.all([
    prisma.signal.findMany({ where: { workspaceId, accountId }, select: { id: true, signalType: true, occurredAt: true }, orderBy: { occurredAt: 'asc' } }),
    prisma.playsLog.findMany({ where: { workspaceId, accountId }, select: { id: true, playType: true, firedAt: true }, orderBy: { firedAt: 'asc' } }),
  ]);

  const touches = [
    ...signals.map((s) => ({ touchType: 'signal', subtype: s.signalType, signalId: s.id, occurredAt: s.occurredAt })),
    ...plays.map((p) => ({ touchType: 'play', subtype: p.playType, signalId: p.id, occurredAt: p.firedAt })),
  ].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());

  // Replace prior attribution for this deal (idempotent on re-delivery).
  await prisma.attributionEvent.deleteMany({ where: { workspaceId, dealId: payload.deal_id } });
  const weight = touches.length > 0 ? 1 / touches.length : 0;
  if (touches.length > 0) {
    await prisma.attributionEvent.createMany({
      data: touches.map((t) => ({
        workspaceId, accountId, dealId: payload.deal_id, touchType: t.touchType, touchSubtype: t.subtype,
        signalId: t.signalId, weight, occurredBeforePipeline: t.occurredAt < closedAt, occurredAt: t.occurredAt,
      })),
    });
  }

  const first = touches[0];
  const last = touches[touches.length - 1];
  const daysToClose = first ? Math.max(0, Math.round((closedAt.getTime() - first.occurredAt.getTime()) / (24 * 3600 * 1000))) : null;
  const fmt = (t: typeof first): TouchSummary | null => (t ? { touch_type: t.touchType, subtype: t.subtype, occurred_at: t.occurredAt.toISOString() } : null);

  return {
    deal_id: payload.deal_id,
    account_id: accountId,
    first_touch: fmt(first),
    last_touch: fmt(last),
    linear: touches.map((t) => ({ touch_type: t.touchType, subtype: t.subtype, weight })),
    touch_count: touches.length,
    days_to_close: daysToClose,
  };
}

// ── Step 3 — pipeline / win-rate / deal-size / days-to-close, by tier ────────

export interface TierMetrics {
  pipeline_by_tier: Json;
  win_rate_by_tier: Json;
  avg_deal_size_by_tier: Json;
  days_to_close_by_tier: Json;
  snapshot_date: string;
}

export async function calculateTierMetrics(workspaceId: string): Promise<TierMetrics> {
  const deals = await prisma.winLossAnalysis.findMany({ where: { workspaceId }, select: { outcome: true, amount: true, accountAttributes: true } });

  const pipeline: Record<string, number> = {};
  const winRate: Record<string, number> = {};
  const avgDeal: Record<string, number> = {};
  const daysToClose: Record<string, number> = {};

  for (const tier of TIERS) {
    const inTier = deals.filter((d) => (d.accountAttributes as { tier?: number } | null)?.tier === tier);
    const won = inTier.filter((d) => d.outcome === 'won');
    const lost = inTier.filter((d) => d.outcome === 'lost');
    const wonAmt = won.reduce((s, d) => s + (d.amount ?? 0), 0);
    const wonDays = won.map((d) => (d.accountAttributes as { days_to_close?: number } | null)?.days_to_close).filter((v): v is number => typeof v === 'number');
    pipeline[tier] = Math.round(wonAmt);
    winRate[tier] = won.length + lost.length > 0 ? Math.round((won.length / (won.length + lost.length)) * 100) / 100 : 0;
    avgDeal[tier] = won.length > 0 ? Math.round(wonAmt / won.length) : 0;
    daysToClose[tier] = wonDays.length > 0 ? Math.round(wonDays.reduce((s, v) => s + v, 0) / wonDays.length) : 0;
  }

  const snapshotDate = new Date().toISOString().slice(0, 10);
  await prisma.pipelineSnapshot.upsert({
    where: { workspaceId_date: { workspaceId, date: new Date(snapshotDate) } },
    create: { workspaceId, date: new Date(snapshotDate), pipelineByTier: pipeline as Prisma.InputJsonValue, winRateByTier: winRate as Prisma.InputJsonValue, avgDealSizeByTier: avgDeal as Prisma.InputJsonValue, daysToCloseByTier: daysToClose as Prisma.InputJsonValue },
    update: { pipelineByTier: pipeline as Prisma.InputJsonValue, winRateByTier: winRate as Prisma.InputJsonValue, avgDealSizeByTier: avgDeal as Prisma.InputJsonValue, daysToCloseByTier: daysToClose as Prisma.InputJsonValue },
  });

  // Keyed flywheel_metrics (for the metrics endpoint + change diffing).
  for (const tier of TIERS) {
    for (const [key, map] of [['pipeline', pipeline], ['win_rate', winRate], ['avg_deal_size', avgDeal], ['days_to_close', daysToClose]] as const) {
      await prisma.flywheelMetric.upsert({
        where: { workspaceId_metricKey_period: { workspaceId, metricKey: `${key}_tier_${tier}`, period: 'all_time' } },
        create: { workspaceId, metricKey: `${key}_tier_${tier}`, value: map[tier], period: 'all_time' },
        update: { value: map[tier], calculatedAt: new Date() },
      });
    }
  }

  return { pipeline_by_tier: pipeline as Json, win_rate_by_tier: winRate as Json, avg_deal_size_by_tier: avgDeal as Json, days_to_close_by_tier: daysToClose as Json, snapshot_date: snapshotDate };
}

// ── Step 4 — signal correlation (suppressed below 20 data points) ────────────

export interface CorrelationResult {
  hasEnoughData: boolean;
  sample_size: number;
  combinations: Array<{ signal_combination: string[]; correlation_score: number }>;
}

export async function runSignalCorrelation(workspaceId: string): Promise<CorrelationResult> {
  const sampleSize = await prisma.winLossAnalysis.count({ where: { workspaceId } });
  if (sampleSize < MIN_CORRELATION_DATA_POINTS) {
    return { hasEnoughData: false, sample_size: sampleSize, combinations: [] };
  }
  // MVP: with ≥20 deals, compute simple win-correlation per dominant signal type from
  // attribution_events. (A richer model is deferred; the suppression gate is the point.)
  const grouped = await prisma.attributionEvent.groupBy({ by: ['touchSubtype'], where: { workspaceId, touchType: 'signal' }, _count: { _all: true } });
  const total = grouped.reduce((s, g) => s + g._count._all, 0) || 1;
  const combinations = grouped
    .filter((g) => g.touchSubtype)
    .map((g) => ({ signal_combination: [g.touchSubtype as string], correlation_score: Math.round((g._count._all / total) * 100) / 100 }))
    .sort((a, b) => b.correlation_score - a.correlation_score);
  await prisma.signalCorrelationData.deleteMany({ where: { workspaceId } });
  if (combinations.length > 0) {
    await prisma.signalCorrelationData.createMany({ data: combinations.map((c) => ({ workspaceId, signalCombination: c.signal_combination, correlationScore: c.correlation_score, sampleSize })) });
  }
  return { hasEnoughData: true, sample_size: sampleSize, combinations };
}

// ── Step 5 — every-5th-win ICP refresh cadence ───────────────────────────────

export async function closedWonCount(workspaceId: string): Promise<number> {
  return prisma.winLossAnalysis.count({ where: { workspaceId, outcome: 'won' } });
}

/** Pure cadence predicate (exact 5th). Used for unit reasoning; the handler uses
 *  claimIcpRefreshMilestone for the atomic, concurrency-safe decision. */
export function shouldRecommendIcpRefresh(closedWonCount: number): boolean {
  return closedWonCount > 0 && closedWonCount % 5 === 0;
}

/**
 * Atomically claim the "every 5th win" milestone. Fires exactly ONCE per 5-band
 * (5, 10, 15…) even when deals close concurrently: a Postgres advisory lock
 * serialises the read-decide-write, and a durable watermark (the highest band
 * already recommended) prevents both double-firing AND skipping a band when the
 * count jumps past an exact multiple under a race.
 */
export async function claimIcpRefreshMilestone(workspaceId: string, count: number): Promise<boolean> {
  if (count < 5) return false;
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`flywheel:${workspaceId}`}))`;
    const band = Math.floor(count / 5); // count 5..9 → 1, 10..14 → 2, …
    const wm = await tx.flywheelMetric.findUnique({ where: { workspaceId_metricKey_period: { workspaceId, metricKey: 'icp_refresh_band', period: 'watermark' } } });
    if (band <= (wm?.value ?? 0)) return false; // this band already recommended
    await tx.flywheelMetric.upsert({
      where: { workspaceId_metricKey_period: { workspaceId, metricKey: 'icp_refresh_band', period: 'watermark' } },
      create: { workspaceId, metricKey: 'icp_refresh_band', period: 'watermark', value: band },
      update: { value: band, calculatedAt: new Date() },
    });
    return true;
  });
}

export async function buildIcpRefreshRecommendation(workspaceId: string, payload: CrmDealClosedWonPayload, count: number): Promise<IcpRefreshRecommendedPayload> {
  // Recent wins drive the recommendation. (Engine 01 Mode B + Sonnet refinement is
  // deferred — the fallback summary keeps the loop closed without an LLM call.)
  const recentWins = await prisma.winLossAnalysis.findMany({ where: { workspaceId, outcome: 'won' }, orderBy: { closedAt: 'desc' }, take: 5, select: { dealId: true, accountAttributes: true } });
  const tiers = recentWins.map((w) => (w.accountAttributes as { tier?: number } | null)?.tier).filter((t): t is number => typeof t === 'number');
  const topTier = tiers.length ? tiers.sort((a, b) => tiers.filter((x) => x === a).length - tiers.filter((x) => x === b).length).pop() : null;
  return {
    closed_won_count: count,
    trigger_deal_id: payload.deal_id,
    new_closed_won_deal_ids: recentWins.map((w) => w.dealId),
    account_attributes: { recent_won_tiers: tiers, top_converting_tier: topTier } as Json,
    recommended_changes_summary: `${count} closed-won deals reached — review the ICP against the last ${recentWins.length} wins${topTier ? ` (most converting Tier ${topTier})` : ''}.`,
  };
}

// ── Step 6 — anti-ICP (loss patterns) ────────────────────────────────────────

export async function updateAntiIcp(workspaceId: string, payload: CrmDealClosedLostPayload): Promise<void> {
  const days = null; // lost deals: days-to-close not meaningful for attribution
  await recordWinLoss(workspaceId, { deal_id: payload.deal_id, account_id: payload.account_id, domain: payload.domain, amount: payload.amount, closed_at: payload.closed_at, owner_id: payload.owner_id }, 'lost', days);
}

// ── Step 8 — flywheel.metrics_updated payload (with change diff) ──────────────

export async function buildMetricsUpdatedPayload(workspaceId: string, metrics: TierMetrics): Promise<FlywheelMetricsUpdatedPayload> {
  // Diff today's snapshot against the prior one for metric_keys_changed.
  const prior = await prisma.pipelineSnapshot.findFirst({ where: { workspaceId, date: { lt: new Date(metrics.snapshot_date) } }, orderBy: { date: 'desc' } });
  const changed: string[] = [];
  if (prior) {
    const cmp = (a: unknown, b: unknown, key: string) => { if (JSON.stringify(a) !== JSON.stringify(b)) changed.push(key); };
    cmp(prior.pipelineByTier, metrics.pipeline_by_tier, 'pipeline_by_tier');
    cmp(prior.winRateByTier, metrics.win_rate_by_tier, 'win_rate_by_tier');
    cmp(prior.avgDealSizeByTier, metrics.avg_deal_size_by_tier, 'avg_deal_size_by_tier');
    cmp(prior.daysToCloseByTier, metrics.days_to_close_by_tier, 'days_to_close_by_tier');
  } else {
    changed.push('pipeline_by_tier', 'win_rate_by_tier', 'avg_deal_size_by_tier', 'days_to_close_by_tier');
  }
  return {
    pipeline_by_tier: metrics.pipeline_by_tier,
    win_rate_by_tier: metrics.win_rate_by_tier,
    avg_deal_size_by_tier: metrics.avg_deal_size_by_tier,
    days_to_close_by_tier: metrics.days_to_close_by_tier,
    snapshot_date: metrics.snapshot_date,
    metric_keys_changed: changed,
  };
}

// ── Read / API support ───────────────────────────────────────────────────────

export async function getPipeline(workspaceId: string) {
  const snap = await prisma.pipelineSnapshot.findFirst({ where: { workspaceId }, orderBy: { date: 'desc' } });
  const history = await prisma.pipelineSnapshot.findMany({ where: { workspaceId }, orderBy: { date: 'asc' }, take: 30, select: { date: true, pipelineByTier: true } });
  return {
    latest: snap ? { date: snap.date.toISOString().slice(0, 10), pipeline_by_tier: snap.pipelineByTier, win_rate_by_tier: snap.winRateByTier, avg_deal_size_by_tier: snap.avgDealSizeByTier, days_to_close_by_tier: snap.daysToCloseByTier } : null,
    history: history.map((h) => ({ date: h.date.toISOString().slice(0, 10), pipeline_by_tier: h.pipelineByTier })),
  };
}

export async function getAttribution(workspaceId: string) {
  const rows = await prisma.attributionEvent.findMany({ where: { workspaceId }, orderBy: { occurredAt: 'desc' }, take: 200 });
  const byDeal = new Map<string, { deal_id: string; account_id: string; touches: Array<{ touch_type: string; subtype: string | null; weight: number; occurred_at: string }> }>();
  for (const r of rows) {
    const entry = byDeal.get(r.dealId) ?? { deal_id: r.dealId, account_id: r.accountId, touches: [] };
    entry.touches.push({ touch_type: r.touchType, subtype: r.touchSubtype, weight: r.weight, occurred_at: r.occurredAt.toISOString() });
    byDeal.set(r.dealId, entry);
  }
  return [...byDeal.values()];
}

export async function getCorrelation(workspaceId: string) {
  const sampleSize = await prisma.winLossAnalysis.count({ where: { workspaceId } });
  if (sampleSize < MIN_CORRELATION_DATA_POINTS) {
    return { has_enough_data: false, sample_size: sampleSize, needed: MIN_CORRELATION_DATA_POINTS, combinations: [] };
  }
  const rows = await prisma.signalCorrelationData.findMany({ where: { workspaceId }, orderBy: { correlationScore: 'desc' }, take: 20 });
  return { has_enough_data: true, sample_size: sampleSize, combinations: rows.map((r) => ({ signal_combination: r.signalCombination, correlation_score: r.correlationScore })) };
}

export async function getMetrics(workspaceId: string) {
  const [metrics, wins, losses] = await Promise.all([
    prisma.flywheelMetric.findMany({ where: { workspaceId }, orderBy: { metricKey: 'asc' } }),
    prisma.winLossAnalysis.count({ where: { workspaceId, outcome: 'won' } }),
    prisma.winLossAnalysis.count({ where: { workspaceId, outcome: 'lost' } }),
  ]);
  return {
    closed_won: wins,
    closed_lost: losses,
    metrics: metrics.map((m) => ({ metric_key: m.metricKey, value: m.value, period: m.period })),
  };
}
