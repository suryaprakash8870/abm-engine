'use client';

/**
 * /pipeline — the live "GTM pipeline" canvas. Shows all 11 engines as connected
 * nodes grouped into 3 phases, each with its real count + status pulled from
 * /api/v1/pipeline/status. This is the SaaS overview layer ON TOP of the engines
 * (it doesn't replace them — each node links into its own engine page).
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

interface EngineStatus {
  num: string;
  slug: string;
  count: number;
  label: string;
  highlight: string | null;
  href: string;
  active: boolean;
}

interface PipelineData {
  engines: EngineStatus[];
  activeCount: number;
  total: number;
}

const ENGINE_NAMES: Record<string, string> = {
  icp: 'ICP Engine',
  tam: 'TAM Builder',
  enrichment: 'Enrichment',
  scoring: 'Scoring',
  tal: 'TAL Manager',
  contacts: 'Contacts',
  signals: 'Signals',
  awareness: 'Awareness',
  plays: 'Plays',
  crm: 'CRM Sync',
  flywheel: 'GTM Flywheel',
};

const PHASES: { title: string; caption: string; nums: string[] }[] = [
  { title: 'Source & Score', caption: 'Find and rank the right accounts', nums: ['01', '02', '03', '04', '05'] },
  { title: 'Engage', caption: 'Map people, watch intent, run plays', nums: ['06', '07', '08', '09'] },
  { title: 'Sync & Learn', caption: 'Write to CRM, learn from outcomes', nums: ['10', '11'] },
];

export default function PipelinePage() {
  const [data, setData] = useState<PipelineData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const res = await fetch('/api/v1/pipeline/status');
      const body = await res.json();
      if (!res.ok) {
        setError(body.error?.message ?? 'Failed to load pipeline.');
      } else {
        setData(body.data ?? body);
        setError(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const iv = setInterval(() => void load(true), 12_000); // live-ish refresh
    return () => clearInterval(iv);
  }, [load]);

  if (loading) return <p className="text-sm text-white/40">Loading pipeline…</p>;
  if (error) return <div className="rounded-xl border border-red-400/25 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div>;
  if (!data) return null;

  const byNum = new Map(data.engines.map((e) => [e.num, e]));

  return (
    <div className="space-y-8">
      {/* Header */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <h1 className="font-display text-[30px] font-medium tracking-tight text-white sm:text-[36px]">
            Your GTM pipeline
          </h1>
          <p className="text-sm text-white/55">
            Eleven engines, one motion. Each runs on its own and feeds the next — click any to dive in.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2 text-sm">
            <span className="font-display text-lg font-semibold text-accent">{data.activeCount}</span>
            <span className="text-white/45"> / {data.total} running</span>
          </div>
          <button
            onClick={() => void load(true)}
            disabled={refreshing}
            className="rounded-xl border border-white/15 bg-white/[0.04] px-3.5 py-2 text-sm font-medium text-white/70 transition hover:border-white/25 hover:text-white disabled:opacity-50"
          >
            {refreshing ? 'Refreshing…' : '↻ Refresh'}
          </button>
        </div>
      </header>

      {/* Overall progress bar */}
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-accent shadow-[0_0_12px_rgba(197,251,80,0.5)] transition-all duration-700"
          style={{ width: `${(data.activeCount / data.total) * 100}%` }}
        />
      </div>

      {/* Phases */}
      <div className="space-y-7">
        {PHASES.map((phase) => (
          <section key={phase.title} className="space-y-3">
            <div className="flex items-baseline gap-3">
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">{phase.title}</h2>
              <span className="text-[12px] text-white/30">{phase.caption}</span>
            </div>
            {/* Single-row flow per phase — scrolls horizontally on narrow
                screens so connectors never dangle at a wrap point. */}
            <div className="-mx-1 flex items-stretch gap-3 overflow-x-auto px-1 pb-2">
              {phase.nums.map((num, i) => {
                const e = byNum.get(num);
                if (!e) return null;
                return (
                  <div key={num} className="flex shrink-0 items-stretch gap-3">
                    <EngineNode engine={e} />
                    {i < phase.nums.length - 1 && <Connector active={e.active} />}
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      {/* Loop-closes callout */}
      <div className="relative overflow-hidden rounded-2xl border border-accent/20 bg-gradient-to-br from-accent/[0.06] via-transparent to-transparent p-6">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(197,251,80,0.28), transparent 70%)', filter: 'blur(50px)' }}
        />
        <div className="relative flex flex-wrap items-center gap-x-3 gap-y-2 font-mono text-[12.5px] text-white/55">
          <span className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-1">11 · Flywheel</span>
          <span className="text-accent">→ icp.refresh_recommended →</span>
          <span className="rounded-md bg-accent/[0.10] px-2 py-1 text-accent">01 · ICP Engine</span>
          <span className="ml-1 font-sans text-white/45">The loop closes — every 5th win refreshes your ICP.</span>
        </div>
      </div>
    </div>
  );
}

function EngineNode({ engine: e }: { engine: EngineStatus }) {
  return (
    <Link
      href={e.href}
      className={`group relative flex w-[176px] flex-col justify-between rounded-2xl border p-4 transition ${
        e.active
          ? 'border-accent/25 bg-accent/[0.04] hover:border-accent/50 hover:bg-accent/[0.07]'
          : 'border-white/[0.08] bg-white/[0.02] hover:border-white/20'
      }`}
    >
      <div className="flex items-start justify-between">
        <span
          className={`flex h-8 w-8 items-center justify-center rounded-lg font-mono text-[12px] font-semibold ${
            e.active ? 'bg-accent/15 text-accent' : 'bg-white/[0.06] text-white/40'
          }`}
        >
          {e.num}
        </span>
        <span
          className={`mt-1 inline-block h-2 w-2 rounded-full ${
            e.active ? 'bg-accent shadow-[0_0_8px_2px_rgba(197,251,80,0.6)]' : 'bg-white/20'
          }`}
          title={e.active ? 'running' : 'no data yet'}
        />
      </div>

      <div className="mt-3">
        <p className="text-[13.5px] font-medium text-white/90">{ENGINE_NAMES[e.slug] ?? e.slug}</p>
        <p className="mt-1.5 flex items-baseline gap-1.5">
          <span className={`font-display text-[22px] font-semibold tabular-nums ${e.active ? 'text-white' : 'text-white/35'}`}>
            {e.count.toLocaleString()}
          </span>
          <span className="text-[11px] text-white/40">{e.label}</span>
        </p>
        {e.highlight && (
          <span
            className={`mt-2 inline-block rounded-full px-2 py-0.5 text-[10.5px] font-medium ${
              e.highlight.includes('not connected')
                ? 'bg-white/10 text-white/45'
                : 'bg-accent/15 text-accent'
            }`}
          >
            {e.highlight}
          </span>
        )}
      </div>
    </Link>
  );
}

/** Animated connector between two engine nodes. */
function Connector({ active }: { active: boolean }) {
  return (
    <div className="relative flex w-6 shrink-0 items-center self-center">
      <div className={`h-px w-full ${active ? 'bg-accent/40' : 'bg-white/10'}`} />
      <svg
        width="8" height="8" viewBox="0 0 24 24" fill="none"
        stroke={active ? '#c5fb50' : 'rgba(255,255,255,0.25)'}
        strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
        className="absolute -right-0.5"
      >
        <path d="M9 6l6 6-6 6" />
      </svg>
    </div>
  );
}
