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
import { listIcps } from '@/lib/web/icp-api';

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
  const [hasIcp, setHasIcp] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [m, f, p, mt, ps, icps] = await Promise.all([
        me(),
        getAwarenessFeed(),
        getPlayFeed('fired'),
        getFlywheelMetrics(),
        fetch('/api/v1/pipeline/status').then((r) => (r.ok ? r.json() : null)).catch(() => null),
        listIcps(),
      ]);
      if (m.ok && m.data) setName(firstName(m.data.email));
      if (f.ok) setFeed(f.data ?? []);
      if (p.ok) setPlays(p.data ?? []);
      if (mt.ok) setMetrics(mt.data ?? null);
      if (ps?.data) setPipeline(ps.data);
      setHasIcp(icps.ok ? (icps.data?.length ?? 0) > 0 : false);
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

  // Fresh workspace: no ICP yet → guide to Step 1 instead of a zeroed-out dashboard.
  if (!loading && hasIcp === false) {
    const stages = [
      { n: '1', label: 'ICP' },
      { n: '2', label: 'Accounts' },
      { n: '3', label: 'Scoring' },
      { n: '4', label: 'Contacts' },
      { n: '5', label: 'Plays' },
    ];
    return (
      <div className="relative flex min-h-[74vh] flex-col items-center justify-center overflow-hidden px-4 text-center">
        {/* ambient glow */}
        <div className="pointer-events-none absolute left-1/2 top-1/3 h-72 w-72 -translate-x-1/2 animate-breathe rounded-full bg-accent/10 blur-3xl" />

        <span className="animate-rise relative inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-3.5 py-1.5 text-[12px] font-medium tracking-wide text-accent">
          <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-accent" /> Step 1 of 5 · start here
        </span>

        <h1 className="animate-rise relative mt-6 max-w-2xl font-display text-[34px] font-medium leading-[1.06] tracking-tight text-white sm:text-[48px]" style={{ animationDelay: '60ms' }}>
          Welcome{name !== 'there' ? `, ${name}` : ''}. Let&apos;s build<br className="hidden sm:block" /> your{' '}
          <span className="relative whitespace-nowrap text-accent">
            ICP
            <span className="absolute inset-x-0 -bottom-1 h-2 -skew-x-6 rounded bg-accent/20" />
          </span>
          .
        </h1>

        <p className="animate-rise relative mt-5 max-w-md text-[15px] leading-relaxed text-white/55" style={{ animationDelay: '120ms' }}>
          Your Ideal Customer Profile is the seed of the whole engine. Define it once and every stage below runs automatically.
        </p>

        {/* pipeline preview — ICP is lit; the rest unlock after it's defined */}
        <div className="animate-rise relative mt-10 flex items-start justify-center gap-1.5 sm:gap-2.5" style={{ animationDelay: '180ms' }}>
          {stages.map((s, i) => (
            <div key={s.label} className="flex items-start gap-1.5 sm:gap-2.5">
              <div className={`flex w-[52px] flex-col items-center gap-2 sm:w-16 ${i === 0 ? '' : 'opacity-40'}`}>
                <div className={`flex h-10 w-10 items-center justify-center rounded-xl border font-display text-[14px] font-semibold ${i === 0 ? 'border-accent/50 bg-accent/15 text-accent shadow-[0_0_22px_-4px_rgba(197,251,80,0.55)]' : 'border-white/10 bg-white/[0.03] text-white/60'}`}>{s.n}</div>
                <span className={`text-[11px] font-medium ${i === 0 ? 'text-white/90' : 'text-white/45'}`}>{s.label}</span>
              </div>
              {i < stages.length - 1 && <span className={`mt-5 h-px w-3 shrink-0 sm:w-6 ${i === 0 ? 'bg-accent/40' : 'bg-white/10'}`} />}
            </div>
          ))}
        </div>

        <div className="animate-rise relative mt-11" style={{ animationDelay: '240ms' }}>
          <Link href="/icp" className="group inline-flex items-center gap-2 rounded-xl bg-accent px-7 py-3.5 text-[15px] font-semibold text-accent-foreground shadow-[0_14px_36px_-12px_rgba(197,251,80,0.65)] transition hover:bg-accent-hover">
            Build your ICP <span className="transition-transform group-hover:translate-x-0.5">→</span>
          </Link>
        </div>

        <p className="animate-rise relative mt-5 text-[12px] text-white/35" style={{ animationDelay: '300ms' }}>
          About a minute · 12 quick questions
        </p>
      </div>
    );
  }

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
