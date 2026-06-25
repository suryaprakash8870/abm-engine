'use client';

import { useState } from 'react';
import Link from 'next/link';

interface SeedResult {
  workspaceId: string;
  counts: Record<string, number>;
}

type Status = 'idle' | 'seeding' | 'seeded' | 'resetting' | 'reset' | 'error';

const QUICK_LINKS: Array<{ label: string; href: string }> = [
  { label: 'ICP', href: '/icp' },
  { label: 'Accounts', href: '/tal' },
  { label: 'Scoring', href: '/scoring' },
  { label: 'TAL', href: '/tal' },
  { label: 'Contacts', href: '/contacts' },
  { label: 'Signals', href: '/signals' },
  { label: 'Awareness', href: '/awareness' },
  { label: 'Plays', href: '/plays' },
  { label: 'Integrations', href: '/integrations' },
  { label: 'Insights', href: '/insights' },
];

export function SeedPanel() {
  const [status, setStatus] = useState<Status>('idle');
  const [result, setResult] = useState<SeedResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const seed = async () => {
    setStatus('seeding');
    setError(null);
    try {
      const res = await fetch('/api/v1/demo/seed', { method: 'POST' });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error?.message ?? 'Seed failed.');
        setStatus('error');
        return;
      }
      setResult(body.data ?? body);
      setStatus('seeded');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error.');
      setStatus('error');
    }
  };

  const reset = async () => {
    setStatus('resetting');
    setError(null);
    try {
      const res = await fetch('/api/v1/demo/reset', { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error?.message ?? 'Reset failed.');
        setStatus('error');
        return;
      }
      setResult(null);
      setStatus('reset');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error.');
      setStatus('error');
    }
  };

  const busy = status === 'seeding' || status === 'resetting';

  return (
    <section className="relative overflow-hidden rounded-2xl border border-accent/25 bg-gradient-to-br from-accent/[0.08] via-transparent to-transparent p-7 md:p-9">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 -right-24 h-[380px] w-[380px] rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(197,251,80,0.30), transparent 70%)',
          filter: 'blur(60px)',
        }}
      />

      <div className="relative grid gap-6 md:grid-cols-[1.4fr_1fr] md:items-center">
        <div className="space-y-3">
          <p className="inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/[0.10] px-3 py-1 text-[10.5px] font-medium uppercase tracking-[0.16em] text-accent">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_8px_2px_rgba(197,251,80,0.7)]" />
            One-click demo
          </p>
          <h2 className="font-display text-[26px] font-medium leading-tight tracking-tight text-white sm:text-[30px]">
            Load realistic data into every engine.
          </h2>
          <p className="max-w-xl text-[14px] leading-relaxed text-white/65">
            Seeds an ICP, 10 enriched + scored accounts, a finalized TAL, buying-committee contacts, recent signals, awareness scores, fired plays with AI drafts, a HubSpot sync log, and 5 closed deals with attribution. Walk every page with real data — no manual setup. Click again to refresh state; click <span className="text-white/85">Clear</span> to go back to empty.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <button
            onClick={seed}
            disabled={busy}
            className="group inline-flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-5 py-3 text-[14px] font-semibold text-accent-foreground shadow-[0_18px_36px_-18px_rgba(197,251,80,0.7)] transition hover:bg-accent-hover hover:shadow-[0_22px_44px_-16px_rgba(197,251,80,0.85)] disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/30 disabled:shadow-none"
          >
            {status === 'seeding' ? (
              <>
                <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-accent-foreground/30 border-t-accent-foreground" />
                Seeding all 11 engines…
              </>
            ) : (
              <>
                Load demo data
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M13 5l7 7-7 7" />
                </svg>
              </>
            )}
          </button>
          <button
            onClick={reset}
            disabled={busy}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.04] px-5 py-2.5 text-[13px] font-medium text-white/70 transition hover:border-white/25 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {status === 'resetting' ? 'Clearing…' : 'Clear all data'}
          </button>
          {error && (
            <p className="rounded-lg border border-red-400/25 bg-red-500/10 px-3 py-2 text-[12px] text-red-200">
              {error}
            </p>
          )}
        </div>
      </div>

      {/* Post-seed quick-links */}
      {status === 'seeded' && result && (
        <div className="relative mt-7 space-y-3 border-t border-accent/15 pt-6">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[12px] text-white/55">
            <span className="font-mono text-accent">✓ Demo loaded</span>
            {Object.entries(result.counts).map(([k, v]) => (
              <span key={k} className="font-mono text-white/45">
                {k.replace(/_/g, ' ')}: <span className="text-white/80">{v}</span>
              </span>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {QUICK_LINKS.map((l) => (
              <Link
                key={l.href + l.label}
                href={l.href}
                className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[12px] text-white/75 transition hover:border-accent/40 hover:bg-accent/[0.08] hover:text-accent"
              >
                {l.label} →
              </Link>
            ))}
          </div>
        </div>
      )}

      {status === 'reset' && (
        <p className="relative mt-5 font-mono text-[12px] text-white/55">
          ✓ Workspace cleared. Click <span className="text-accent">Load demo data</span> to reseed.
        </p>
      )}
    </section>
  );
}
