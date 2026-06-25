'use client';

/**
 * /today — the daily home. One screen answering "who's hot, what to action,
 * what closed." Aggregates across engines (awareness, plays, flywheel, pipeline)
 * so the user lives here instead of operating 11 pages.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Pill } from '@/app/icp/ui';
import { me } from '@/lib/web/auth-api';
import { getAwarenessFeed, type FeedAccount } from '@/lib/web/awareness-api';
import { getPlayFeed, type Play } from '@/lib/web/plays-api';
import { getFlywheelMetrics, type MetricsData } from '@/lib/web/flywheel-api';

interface PipelineStatus { engines: { num: string; count: number; active: boolean }[] }

const STAGE_TONE: Record<string, 'gray' | 'blue' | 'amber' | 'green'> = {
  identified: 'gray', aware: 'blue', interested: 'blue', considering: 'amber', selecting: 'green',
};

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}
function firstName(email: string | null): string {
  if (!email) return 'there';
  const local = (email.split('@')[0] ?? '').split(/[._\-+]/)[0] || 'there';
  return local.charAt(0).toUpperCase() + local.slice(1);
}

export default function TodayPage() {
  const [name, setName] = useState('there');
  const [feed, setFeed] = useState<FeedAccount[]>([]);
  const [plays, setPlays] = useState<Play[]>([]);
  const [metrics, setMetrics] = useState<MetricsData | null>(null);
  const [pipeline, setPipeline] = useState<PipelineStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [m, f, p, mt, ps] = await Promise.all([
        me(),
        getAwarenessFeed(),
        getPlayFeed('fired'),
        getFlywheelMetrics(),
        fetch('/api/v1/pipeline/status').then((r) => (r.ok ? r.json() : null)).catch(() => null),
      ]);
      if (m.ok && m.data) setName(firstName(m.data.email));
      if (f.ok) setFeed(f.data ?? []);
      if (p.ok) setPlays(p.data ?? []);
      if (mt.ok) setMetrics(mt.data ?? null);
      if (ps?.data) setPipeline(ps.data);
      setLoading(false);
    })();
  }, []);

  const engine = (num: string) => pipeline?.engines.find((e) => e.num === num)?.count ?? 0;
  const hot = feed.filter((a) => a.score >= 60);
  const topHot = [...feed].sort((a, b) => b.score - a.score).slice(0, 6);
  const openPlays = plays.slice(0, 5);

  const kpis = [
    { label: 'Target accounts', value: engine('05'), href: '/tal' },
    { label: 'Hot accounts', value: hot.length, href: '/awareness' },
    { label: 'Plays fired', value: engine('09'), href: '/plays' },
    { label: 'Deals won', value: metrics?.closed_won ?? engine('11'), href: '/insights' },
  ];

  return (
    <div className="space-y-7">
      {/* Greeting */}
      <header className="animate-rise">
        <h1 className="font-display text-[30px] font-medium tracking-tight text-white sm:text-[34px]">
          {greeting()}, {name}.
        </h1>
        <p className="mt-1 text-sm text-white/45">
          {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
          {!loading && hot.length > 0 && (
            <> · <span className="text-accent">{hot.length} accounts are hot</span> right now</>
          )}
        </p>
      </header>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((k) => (
          <Link
            key={k.label}
            href={k.href}
            className="group rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4 transition hover:border-accent/30 hover:bg-white/[0.05]"
          >
            <p className="font-display text-[28px] font-semibold tabular-nums text-white">{loading ? '—' : k.value.toLocaleString()}</p>
            <p className="mt-0.5 text-[12px] text-white/45 transition group-hover:text-white/70">{k.label}</p>
          </Link>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Hot accounts */}
        <section className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-medium text-white/85">🔥 Hot accounts</h2>
            <Link href="/awareness" className="text-[12px] text-accent transition hover:text-accent-hover">View all →</Link>
          </div>
          {loading ? (
            <p className="text-sm text-white/35">Loading…</p>
          ) : topHot.length === 0 ? (
            <p className="py-6 text-center text-sm text-white/35">No awareness scores yet. Signals build these.</p>
          ) : (
            <ul className="space-y-2.5">
              {topHot.map((a) => (
                <li key={a.account_id} className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-medium text-white/90">{a.name ?? a.account_id.slice(0, 10)}</p>
                    <p className="truncate text-[11px] text-white/40">{a.domain ?? '—'}{a.tier ? ` · Tier ${a.tier}` : ''}</p>
                  </div>
                  <div className="flex w-24 items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                      <div className={`h-full rounded-full ${a.score >= 80 ? 'bg-accent' : a.score >= 40 ? 'bg-amber-400' : 'bg-white/30'}`} style={{ width: `${a.score}%` }} />
                    </div>
                    <span className="w-6 text-right text-[12px] tabular-nums text-white/70">{a.score}</span>
                  </div>
                  <Pill tone={STAGE_TONE[a.stage] ?? 'gray'}>{a.stage}</Pill>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Plays to action */}
        <section className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-medium text-white/85">✦ Plays to action</h2>
            <Link href="/plays" className="text-[12px] text-accent transition hover:text-accent-hover">Open queue →</Link>
          </div>
          {loading ? (
            <p className="text-sm text-white/35">Loading…</p>
          ) : openPlays.length === 0 ? (
            <p className="py-6 text-center text-sm text-white/35">No plays fired yet. Hot accounts trigger these.</p>
          ) : (
            <ul className="space-y-2.5">
              {openPlays.map((p) => (
                <li key={p.id} className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-medium text-white/90">{p.account_name ?? p.account_id.slice(0, 10)}</p>
                    <p className="truncate text-[11px] text-white/40">{p.play_type.replace(/_/g, ' ')}</p>
                  </div>
                  {p.outcome ? <Pill tone="green">{p.outcome}</Pill> : <Pill tone="amber">needs action</Pill>}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Outcomes strip */}
      <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/[0.08] bg-white/[0.025] p-5">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
          <Stat label="Closed won" value={loading ? '—' : String(metrics?.closed_won ?? 0)} tone="accent" />
          <Stat label="Closed lost" value={loading ? '—' : String(metrics?.closed_lost ?? 0)} tone="muted" />
          {metrics?.metrics?.find((m) => m.metric_key === 'pipeline_this_month') && (
            <Stat
              label="Pipeline (mo)"
              value={`$${Math.round((metrics.metrics.find((m) => m.metric_key === 'pipeline_this_month')!.value) / 1000)}k`}
              tone="white"
            />
          )}
        </div>
        <Link href="/insights" className="text-[12px] text-accent transition hover:text-accent-hover">See attribution →</Link>
      </section>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: 'accent' | 'white' | 'muted' }) {
  const color = tone === 'accent' ? 'text-accent' : tone === 'muted' ? 'text-white/50' : 'text-white';
  return (
    <div>
      <p className={`font-display text-[22px] font-semibold tabular-nums ${color}`}>{value}</p>
      <p className="text-[11px] text-white/40">{label}</p>
    </div>
  );
}
