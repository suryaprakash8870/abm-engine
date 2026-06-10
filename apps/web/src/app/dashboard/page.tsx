'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';

type Summary = {
  total: number;
  tierCounts: { tier1: number; tier2: number; tier3: number; unscored: number };
  awarenessCounts: {
    identified: number;
    aware: number;
    engaged: number;
    considering: number;
    selecting: number;
  };
  lastScoredAt: string | null;
  avgFitScore: number | null;
};

type ValidationReport = {
  provider: string;
  dealsScanned: number;
  wonMatched: number;
  criterion: string;
  stages: Array<{
    stage: string;
    accounts: number;
    won: number;
    lost: number;
    wonRate: number;
  }>;
  gateStatus: 'pending-data' | 'passed' | 'failed';
  verdict: string;
};

const STAGE_ORDER = ['identified', 'aware', 'engaged', 'considering', 'selecting'] as const;
type AwarenessStage = (typeof STAGE_ORDER)[number];

const STAGE_LABELS: Record<AwarenessStage, string> = {
  identified: 'Identified',
  aware: 'Aware',
  engaged: 'Engaged',
  considering: 'Considering',
  selecting: 'Selecting',
};

const STAGE_BAR_COLORS: Record<AwarenessStage, string> = {
  identified: 'bg-neutral-400 dark:bg-neutral-600',
  aware: 'bg-sky-500',
  engaged: 'bg-indigo-500',
  considering: 'bg-amber-500',
  selecting: 'bg-emerald-500',
};

// Donut segment colors (fixed hex — used inside conic-gradient, same in dark mode).
const DONUT_SEGMENTS: Array<{ key: keyof Summary['tierCounts']; label: string; color: string }> = [
  { key: 'tier1', label: 'Tier 1', color: '#10b981' }, // emerald-500
  { key: 'tier2', label: 'Tier 2', color: '#f59e0b' }, // amber-500
  { key: 'tier3', label: 'Tier 3', color: '#a3a3a3' }, // neutral-400
  { key: 'unscored', label: 'Unscored', color: '#e5e5e5' }, // neutral-200
];

function donutGradient(tierCounts: Summary['tierCounts']): string {
  const total =
    tierCounts.tier1 + tierCounts.tier2 + tierCounts.tier3 + tierCounts.unscored;
  if (total === 0) return 'conic-gradient(#e5e5e5 0% 100%)';
  const stops: string[] = [];
  let acc = 0;
  for (const seg of DONUT_SEGMENTS) {
    const count = tierCounts[seg.key];
    if (count <= 0) continue;
    const start = (acc / total) * 100;
    acc += count;
    const end = (acc / total) * 100;
    stops.push(`${seg.color} ${start}% ${end}%`);
  }
  if (stops.length === 0) return 'conic-gradient(#e5e5e5 0% 100%)';
  return `conic-gradient(${stops.join(', ')})`;
}

function relativeTime(iso: string): string {
  const diffSec = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (diffSec < 60) return 'just now';
  const min = Math.round(diffSec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}d ago`;
  return new Date(iso).toLocaleDateString();
}

function MetricCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-950">
      <div className="text-xs font-medium uppercase tracking-wider text-neutral-500">{label}</div>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function GateBadge({ status }: { status: ValidationReport['gateStatus'] }) {
  if (status === 'passed')
    return (
      <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
        Passed
      </span>
    );
  if (status === 'failed')
    return (
      <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800 dark:bg-red-950 dark:text-red-300">
        Failed
      </span>
    );
  return (
    <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300">
      Pending data
    </span>
  );
}

export default function DashboardPage() {
  const summary = useQuery<Summary>({
    queryKey: ['accounts-summary'],
    queryFn: () => apiFetch<Summary>('/api/accounts/summary'),
  });

  // Calls the live CRM — can fail when HubSpot isn't configured. Never retry.
  const validation = useQuery<ValidationReport>({
    queryKey: ['validation-awareness'],
    queryFn: () => apiFetch<ValidationReport>('/api/validation/awareness'),
    retry: false,
  });

  const s = summary.data;
  const maxStageCount = s
    ? Math.max(...STAGE_ORDER.map((stage) => s.awarenessCounts[stage]), 1)
    : 1;

  return (
    <main className="mx-auto max-w-7xl px-6 py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="mt-1 text-sm text-neutral-500">The engine at a glance.</p>
      </header>

      {summary.isError && (
        <div className="mb-6 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {(summary.error as Error).message}
        </div>
      )}

      {/* ─── Metrics row ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard label="Total accounts">
          <div className="text-3xl font-semibold tabular-nums">
            {summary.isLoading ? '…' : s?.total ?? 0}
          </div>
        </MetricCard>

        <MetricCard label="Tiers">
          {summary.isLoading ? (
            <div className="text-3xl font-semibold tabular-nums">…</div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                  T1 · {s?.tierCounts.tier1 ?? 0}
                </span>
                <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                  T2 · {s?.tierCounts.tier2 ?? 0}
                </span>
                <span className="inline-flex items-center rounded-full bg-neutral-200 px-2 py-0.5 text-xs font-medium text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
                  T3 · {s?.tierCounts.tier3 ?? 0}
                </span>
              </div>
              <p className="mt-2 text-xs text-neutral-500">
                {s?.tierCounts.unscored ?? 0} unscored
              </p>
            </>
          )}
        </MetricCard>

        <MetricCard label="Avg fit score">
          <div className="text-3xl font-semibold tabular-nums">
            {summary.isLoading
              ? '…'
              : s?.avgFitScore === null || s?.avgFitScore === undefined
                ? '—'
                : Math.round(s.avgFitScore * 10) / 10}
          </div>
        </MetricCard>

        <MetricCard label="Last scored">
          <div className="text-3xl font-semibold">
            {summary.isLoading ? '…' : s?.lastScoredAt ? relativeTime(s.lastScoredAt) : '—'}
          </div>
          {!summary.isLoading && !s?.lastScoredAt && (
            <p className="mt-2 text-xs text-neutral-500">No accounts scored yet</p>
          )}
        </MetricCard>
      </div>

      {/* ─── Donut + funnel ──────────────────────────────────────── */}
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-950">
          <h2 className="text-sm font-medium uppercase tracking-wider text-neutral-500">
            Tier distribution
          </h2>
          <div className="mt-4 flex flex-wrap items-center gap-8">
            <div
              className="relative h-40 w-40 shrink-0 rounded-full"
              style={{ background: s ? donutGradient(s.tierCounts) : 'conic-gradient(#e5e5e5 0% 100%)' }}
              role="img"
              aria-label="Tier distribution donut chart"
            >
              <div className="absolute inset-0 m-auto flex h-24 w-24 items-center justify-center rounded-full bg-white dark:bg-neutral-950">
                <div className="text-center">
                  <div className="text-2xl font-semibold tabular-nums">{s?.total ?? 0}</div>
                  <div className="text-[10px] uppercase tracking-wider text-neutral-500">
                    accounts
                  </div>
                </div>
              </div>
            </div>
            <ul className="space-y-2">
              {DONUT_SEGMENTS.map((seg) => (
                <li key={seg.key} className="flex items-center gap-2 text-sm">
                  <span
                    className="h-3 w-3 shrink-0 rounded-sm"
                    style={{ backgroundColor: seg.color }}
                  />
                  <span className="text-neutral-600 dark:text-neutral-400">{seg.label}</span>
                  <span className="font-medium tabular-nums">
                    {s ? s.tierCounts[seg.key] : 0}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="rounded-lg border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-950">
          <h2 className="text-sm font-medium uppercase tracking-wider text-neutral-500">
            Awareness funnel
          </h2>
          <div className="mt-4 space-y-3">
            {STAGE_ORDER.map((stage) => {
              const count = s?.awarenessCounts[stage] ?? 0;
              const pct = (count / maxStageCount) * 100;
              return (
                <div key={stage} className="flex items-center gap-3">
                  <div className="w-24 shrink-0 text-xs text-neutral-500">
                    {STAGE_LABELS[stage]}
                  </div>
                  <div className="h-6 flex-1 overflow-hidden rounded bg-neutral-100 dark:bg-neutral-900">
                    <div
                      className={`h-full rounded ${STAGE_BAR_COLORS[stage]}`}
                      style={{ width: count > 0 ? `${Math.max(pct, 4)}%` : '0%' }}
                    />
                  </div>
                  <div className="w-10 shrink-0 text-right text-sm font-medium tabular-nums">
                    {count}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ─── Validation gate ─────────────────────────────────────── */}
      <section className="mt-6">
        <div className="rounded-lg border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-950">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-sm font-medium uppercase tracking-wider text-neutral-500">
              Validation gate — awareness vs closed-won
            </h2>
            {validation.data && <GateBadge status={validation.data.gateStatus} />}
          </div>

          {validation.isLoading && (
            <p className="mt-4 text-sm text-neutral-500">Running validation against the CRM…</p>
          )}

          {validation.isError && (
            <div className="mt-4 rounded-md border border-neutral-200 bg-neutral-50 px-4 py-6 text-sm text-neutral-500 dark:border-neutral-800 dark:bg-neutral-900">
              Connect HubSpot to run the validation report.
            </div>
          )}

          {validation.data && (
            <>
              <p className="mt-4 text-sm text-neutral-700 dark:text-neutral-300">
                {validation.data.verdict}
              </p>
              <p className="mt-1 text-xs text-neutral-500">
                {validation.data.provider} · {validation.data.dealsScanned} deals scanned ·{' '}
                {validation.data.wonMatched} won matched · {validation.data.criterion}
              </p>

              <div className="mt-4 overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-800">
                <table className="min-w-full divide-y divide-neutral-200 dark:divide-neutral-800">
                  <thead className="bg-neutral-50 dark:bg-neutral-900">
                    <tr>
                      {['Stage', 'Accounts', 'Won', 'Lost', 'Won rate'].map((h) => (
                        <th
                          key={h}
                          className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-neutral-500"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-200 bg-white dark:divide-neutral-800 dark:bg-neutral-950">
                    {validation.data.stages.map((row) => (
                      <tr key={row.stage}>
                        <td className="px-4 py-2 text-sm font-medium capitalize">{row.stage}</td>
                        <td className="px-4 py-2 text-sm tabular-nums text-neutral-600 dark:text-neutral-400">
                          {row.accounts}
                        </td>
                        <td className="px-4 py-2 text-sm tabular-nums text-neutral-600 dark:text-neutral-400">
                          {row.won}
                        </td>
                        <td className="px-4 py-2 text-sm tabular-nums text-neutral-600 dark:text-neutral-400">
                          {row.lost}
                        </td>
                        <td className="px-4 py-2 text-sm font-semibold tabular-nums">
                          {row.wonRate}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
