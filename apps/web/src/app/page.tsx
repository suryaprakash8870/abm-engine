'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import { useSyncFromHubspot } from '@/lib/use-sync-from-hubspot';
import { SyncProgressBar } from '@/components/sync-progress';

type Summary = {
  total: number;
  tierCounts: { tier1: number; tier2: number; tier3: number; unscored: number };
  lastScoredAt: string | null;
  avgFitScore: number | null;
};

function useSummary() {
  return useQuery<Summary>({
    queryKey: ['accounts', 'summary'],
    queryFn: () => apiFetch<Summary>('/api/accounts/summary'),
    refetchInterval: 5_000, // landing page is a status board — keep it fresh
  });
}

type ComponentStatus = 'live' | 'pending' | 'gated';

interface PipelineComponent {
  key: string;
  name: string;
  status: ComponentStatus;
  statusLabel: string;
  blurb: string;
  stat?: (s: Summary) => string;
}

const PIPELINE: PipelineComponent[] = [
  {
    key: 'crm-adapter',
    name: 'CRM Adapter',
    status: 'live',
    statusLabel: 'Live · HubSpot',
    blurb: 'Reads & writes the customer\'s CRM. Only this module talks to HubSpot.',
    stat: (s) => `${s.total} accounts synced`,
  },
  {
    key: 'enrichment',
    name: 'Enrichment',
    status: 'pending',
    statusLabel: 'Phase 1 · partial',
    blurb: 'Industry, employees, country, tech stack. HubSpot Insights for now; Apollo/Clearbit later.',
  },
  {
    key: 'scoring',
    name: 'Scoring',
    status: 'live',
    statusLabel: 'Live · rubric v1',
    blurb: 'Applies the ICP rubric → fit score + tier. Rules-based by design (no ML yet).',
    stat: (s) =>
      s.avgFitScore !== null ? `Avg fit ${s.avgFitScore} · ${s.tierCounts.tier1} T1` : 'awaiting data',
  },
  {
    key: 'signal-scorer',
    name: 'Signal Scorer',
    status: 'pending',
    statusLabel: 'Phase 2',
    blurb: 'Weighted, time-decayed signals (1st-party ≫ 3rd-party). Awareness stage.',
  },
  {
    key: 'orchestrator',
    name: 'Orchestrator',
    status: 'gated',
    statusLabel: 'Phase 3 · gated',
    blurb: 'Rules engine: alerts, tasks, write-back. Gated on Phase 2 validation.',
  },
];

function StatusPill({ status, label }: { status: ComponentStatus; label: string }) {
  const cls =
    status === 'live'
      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
      : status === 'pending'
        ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
        : 'bg-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-400';
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${cls}`}>
      {label}
    </span>
  );
}

function formatTime(iso: string | null): string {
  if (!iso) return 'never';
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(iso).toLocaleDateString();
}

export default function HomePage() {
  const summary = useSummary();
  const sync = useSyncFromHubspot();
  const s = summary.data ?? {
    total: 0,
    tierCounts: { tier1: 0, tier2: 0, tier3: 0, unscored: 0 },
    lastScoredAt: null,
    avgFitScore: null,
  };

  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      <header className="mb-10">
        <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
        <p className="mt-2 text-sm text-neutral-500">
          CRM-agnostic intelligence layer · Phase 1 in progress · last scored {formatTime(s.lastScoredAt)}
        </p>
      </header>

      {/* ─── Live numbers ─────────────────────────────────────── */}
      <section className="mb-10 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Accounts', value: s.total, accent: '' },
          { label: 'Tier 1', value: s.tierCounts.tier1, accent: 'text-emerald-600 dark:text-emerald-400' },
          { label: 'Tier 2', value: s.tierCounts.tier2, accent: 'text-amber-600 dark:text-amber-400' },
          { label: 'Tier 3', value: s.tierCounts.tier3, accent: 'text-neutral-600 dark:text-neutral-400' },
        ].map((c) => (
          <div
            key={c.label}
            className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950"
          >
            <div className="text-xs uppercase tracking-wider text-neutral-500">{c.label}</div>
            <div className={`mt-1 text-2xl font-semibold tabular-nums ${c.accent}`}>{c.value}</div>
          </div>
        ))}
      </section>

      {/* ─── Pipeline visualization ───────────────────────────── */}
      <section className="mb-10">
        <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-neutral-500">
          The pipeline
        </h2>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-5">
          {PIPELINE.map((c, i) => (
            <div key={c.key} className="relative">
              <div
                className={`flex h-full flex-col rounded-lg border p-4 ${
                  c.status === 'live'
                    ? 'border-emerald-200 bg-emerald-50/40 dark:border-emerald-900 dark:bg-emerald-950/40'
                    : c.status === 'pending'
                      ? 'border-amber-200 bg-amber-50/40 dark:border-amber-900 dark:bg-amber-950/40'
                      : 'border-neutral-200 bg-neutral-50/40 dark:border-neutral-800 dark:bg-neutral-900/40'
                }`}
              >
                <div className="mb-1 text-[10px] font-semibold tabular-nums text-neutral-400">
                  {String(i + 1).padStart(2, '0')}
                </div>
                <div className="font-medium">{c.name}</div>
                <div className="mt-1">
                  <StatusPill status={c.status} label={c.statusLabel} />
                </div>
                <p className="mt-2 text-xs text-neutral-500">{c.blurb}</p>
                {c.stat && (
                  <div className="mt-3 text-xs font-medium text-neutral-700 dark:text-neutral-300">
                    {c.stat(s)}
                  </div>
                )}
              </div>
              {/* arrow connector on lg+ between cards */}
              {i < PIPELINE.length - 1 && (
                <div className="pointer-events-none absolute -right-2 top-1/2 hidden -translate-y-1/2 text-neutral-400 lg:block">
                  →
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ─── Sync section ─────────────────────────────────────── */}
      <section className="rounded-lg border border-neutral-200 p-5 dark:border-neutral-800">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="font-medium">Sync from HubSpot</div>
            <div className="mt-1 text-sm text-neutral-500">
              Pulls accounts from the connected CRM, upserts into our DB, scores against the rubric.
              Idempotent — safe to re-run.
            </div>
          </div>
          <button
            onClick={() => sync.mutate()}
            disabled={sync.isPending}
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
          >
            {sync.isPending ? 'Syncing…' : 'Sync now'}
          </button>
        </div>
        {sync.isPending && (
          <div className="mt-4">
            <SyncProgressBar progress={sync.progress} />
          </div>
        )}
        {sync.isError && (
          <div className="mt-4 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
            Sync failed: {(sync.error as Error)?.message}
          </div>
        )}
        {sync.isSuccess && !sync.isPending && (
          <div className="mt-4 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
            Sync complete — scores recomputed.
          </div>
        )}
      </section>
    </main>
  );
}
