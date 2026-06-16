/**
 * Deal analysis pipeline — shared by Mode B (CRM analysis) and Mode C (CSV import).
 *
 * Given a set of closed-won/lost deals (with company attributes), compute win/loss
 * statistics and have Claude Sonnet interpret them into the same structured ICP that
 * the wizard produces. This is the BUILT logic; the deal SOURCE differs per mode
 * (HubSpot OAuth for B, an uploaded CSV for C).
 */

import { synthesiseContent } from './claude';
import type { IcpContent } from './types';

export interface Deal {
  outcome: 'won' | 'lost';
  domain?: string;
  industry?: string;
  employees?: number;
  revenue?: number;
  geography?: string;
  tech?: string[];
  amount?: number;
}

/** Minimum closed-won deals for a statistically meaningful ICP (doc failure handling). */
export const MIN_WON_DEALS = 5;

/** Thrown when there are too few closed-won deals — caller routes to Mode A. */
export class InsufficientDealsError extends Error {
  constructor(public readonly wonCount: number) {
    super(`Only ${wonCount} closed-won deals (need >= ${MIN_WON_DEALS}).`);
    this.name = 'InsufficientDealsError';
  }
}

export interface DealStats {
  wonCount: number;
  lostCount: number;
  avgWonAmount: number | null;
  industryWinRate: { industry: string; won: number; total: number; winRate: number }[];
  topWonGeographies: { geography: string; count: number }[];
  commonWonTech: { tech: string; count: number }[];
  employeeRange: { min: number; max: number } | null;
  lostIndustries: { industry: string; count: number }[];
}

function topCounts(items: string[], limit = 10): [string, number][] {
  const m = new Map<string, number>();
  for (const i of items) m.set(i, (m.get(i) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
}

export function computeDealStats(deals: Deal[]): DealStats {
  const won = deals.filter((d) => d.outcome === 'won');
  const lost = deals.filter((d) => d.outcome === 'lost');

  const byIndustry = new Map<string, { won: number; total: number }>();
  for (const d of deals) {
    if (!d.industry) continue;
    const e = byIndustry.get(d.industry) ?? { won: 0, total: 0 };
    e.total++;
    if (d.outcome === 'won') e.won++;
    byIndustry.set(d.industry, e);
  }
  const industryWinRate = [...byIndustry.entries()]
    .map(([industry, v]) => ({ industry, won: v.won, total: v.total, winRate: v.total ? v.won / v.total : 0 }))
    .sort((a, b) => b.winRate - a.winRate || b.total - a.total);

  const topWonGeographies = topCounts(won.map((d) => d.geography).filter((g): g is string => !!g))
    .map(([geography, count]) => ({ geography, count }));

  const commonWonTech = topCounts(won.flatMap((d) => d.tech ?? []))
    .map(([tech, count]) => ({ tech, count }));

  const emp = won.map((d) => d.employees).filter((n): n is number => typeof n === 'number' && n > 0);
  const employeeRange = emp.length ? { min: Math.min(...emp), max: Math.max(...emp) } : null;

  const amts = won.map((d) => d.amount).filter((n): n is number => typeof n === 'number');
  const avgWonAmount = amts.length ? Math.round(amts.reduce((a, b) => a + b, 0) / amts.length) : null;

  const lostIndustries = topCounts(lost.map((d) => d.industry).filter((i): i is string => !!i))
    .map(([industry, count]) => ({ industry, count }));

  return { wonCount: won.length, lostCount: lost.length, avgWonAmount, industryWinRate, topWonGeographies, commonWonTech, employeeRange, lostIndustries };
}

const ANALYSIS_SYSTEM_PROMPT =
  'You are a B2B go-to-market analyst. From win/loss deal statistics, infer the ' +
  'Ideal Customer Profile. Weight each criterion by statistical strength: high ' +
  'confidence (toward 1.0) where a segment has many deals and a clear win-rate edge; ' +
  'low confidence (toward 0.3) where the sample is small or mixed. Treat industries ' +
  'frequent among LOST deals as candidate exclusions. Always call emit_icp.';

function buildAnalysisPrompt(stats: DealStats): string {
  const winRates = stats.industryWinRate
    .map((i) => `- ${i.industry}: ${(i.winRate * 100).toFixed(0)}% win (${i.won}/${i.total})`)
    .join('\n') || '- (no industry data)';
  return [
    `Closed-won deals: ${stats.wonCount}. Closed-lost deals: ${stats.lostCount}.`,
    `Average won deal size: ${stats.avgWonAmount ?? 'unknown'}.`,
    `Won employee range: ${stats.employeeRange ? `${stats.employeeRange.min}–${stats.employeeRange.max}` : 'unknown'}.`,
    `Win rate by industry:\n${winRates}`,
    `Top geographies among won: ${stats.topWonGeographies.map((g) => `${g.geography} (${g.count})`).join(', ') || 'n/a'}`,
    `Common tech among won: ${stats.commonWonTech.map((t) => `${t.tech} (${t.count})`).join(', ') || 'n/a'}`,
    `Industries frequent among LOST deals (candidate exclusions): ${stats.lostIndustries.map((i) => `${i.industry} (${i.count})`).join(', ') || 'n/a'}`,
    '',
    'Synthesise the ICP from these patterns. Call emit_icp.',
  ].join('\n');
}

/** Run the analysis pipeline. Throws InsufficientDealsError if too few wins. */
export async function analyseDeals(deals: Deal[]): Promise<IcpContent> {
  const wonCount = deals.filter((d) => d.outcome === 'won').length;
  if (wonCount < MIN_WON_DEALS) throw new InsufficientDealsError(wonCount);
  const stats = computeDealStats(deals);
  return synthesiseContent(ANALYSIS_SYSTEM_PROMPT, buildAnalysisPrompt(stats));
}

/** Map uploaded CSV rows (Mode C) into normalised Deals using a field mapping. */
export function mapCsvRowsToDeals(
  rows: Record<string, string>[],
  mapping: Record<string, string>,
): Deal[] {
  const col = (row: Record<string, string>, field: string): string | undefined => {
    const key = mapping[field];
    return key ? row[key] : undefined;
  };
  const num = (v?: string): number | undefined => {
    if (v == null || v === '') return undefined;
    const n = Number(String(v).replace(/[^0-9.\-]/g, ''));
    return Number.isFinite(n) ? n : undefined;
  };

  const deals: Deal[] = [];
  for (const row of rows) {
    const outcomeRaw = (col(row, 'outcome') ?? '').toLowerCase();
    const outcome: Deal['outcome'] | null = outcomeRaw.includes('won')
      ? 'won'
      : outcomeRaw.includes('lost')
        ? 'lost'
        : null;
    if (!outcome) continue; // skip open / other-stage deals

    const techRaw = col(row, 'tech');
    deals.push({
      outcome,
      domain: col(row, 'domain'),
      industry: col(row, 'industry'),
      employees: num(col(row, 'employees')),
      revenue: num(col(row, 'revenue')),
      geography: col(row, 'geography'),
      amount: num(col(row, 'amount')),
      tech: techRaw ? techRaw.split(/[;,]/).map((s) => s.trim()).filter(Boolean) : undefined,
    });
  }
  return deals;
}
