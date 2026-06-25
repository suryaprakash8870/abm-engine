'use client';

import { useEffect, useState } from 'react';
import { Card, Pill, Banner, WhatsNext } from '@/app/icp/ui';
import { usePagination, Pagination } from '@/lib/web/pagination';
import { getTrackingToken, getRecentSignals, fireTestSignal, runResearch, type TokenInfo, type RecentSignal } from '@/lib/web/signals-api';

const SOURCE_TONE: Record<string, 'green' | 'amber' | 'blue' | 'gray'> = {
  website: 'blue',
  crm_webhook: 'green',
  email_webhook: 'amber',
  research: 'amber',
};

function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${Math.floor(s)}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default function SignalsPage() {
  const [token, setToken] = useState<TokenInfo | null>(null);
  const [signals, setSignals] = useState<RecentSignal[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [testing, setTesting] = useState(false);
  const [researching, setResearching] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadSignals = async () => {
    const res = await getRecentSignals();
    if (res.ok) setSignals(res.data ?? []);
  };

  useEffect(() => {
    (async () => {
      const [t] = await Promise.all([getTrackingToken(), loadSignals()]);
      if (t.ok) setToken(t.data ?? null);
      else setError(t.error?.message ?? 'Failed to load tracking token.');
      setLoading(false);
    })();
  }, []);

  const copy = async () => {
    if (!token) return;
    try { await navigator.clipboard.writeText(token.snippet); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ }
  };

  const runTest = async () => {
    setTesting(true); setNotice(null); setError(null);
    const res = await fireTestSignal();
    if (res.ok && res.data) { setNotice(res.data.message); await loadSignals(); }
    else setError(res.error?.message ?? 'Test failed.');
    setTesting(false);
  };

  const runResearchNow = async () => {
    setResearching(true); setNotice(null); setError(null);
    const res = await runResearch();
    if (res.ok && res.data) {
      const d = res.data;
      if (!d.scraped) setNotice(`Couldn't research ${d.account_name ?? 'the account'} (no domain to scrape).`);
      else setNotice(`Researched ${d.account_name ?? d.account_id} via ${d.source} (${d.model_used}): ${d.published} new signal${d.published === 1 ? '' : 's'}, ${d.discarded} discarded.`);
      await loadSignals();
    } else setError(res.error?.message ?? 'Research failed.');
    setResearching(false);
  };

  const pg = usePagination(signals, 25);

  if (loading) return <p className="text-sm text-white/40">Loading…</p>;

  const installed = signals.some((s) => s.signal_source === 'website');

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <h1 className="font-display text-2xl font-medium text-white">Signals</h1>
        <Pill tone="green">{signals.length} recent</Pill>
        {installed ? <Pill tone="blue">snippet active</Pill> : <Pill tone="gray">snippet not detected</Pill>}
      </div>

      {error && <Banner tone="red">{error}</Banner>}

      {/* Tracking snippet */}
      <Card className="space-y-4">
        <div>
          <h2 className="text-sm font-medium text-white/85">Website tracking snippet</h2>
          <p className="mt-1 text-xs text-white/45">
            Paste this before <code className="text-white/60">&lt;/head&gt;</code> on your site (Webflow, WordPress, Framer, or raw HTML). Visits from target accounts become signals automatically.
          </p>
        </div>
        {token && (
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-emerald-200">{token.snippet}</code>
            <button onClick={copy} className="rounded-lg border border-white/10 px-3 py-2 text-xs text-white/70 hover:bg-white/10 transition">
              {copied ? 'Copied ✓' : 'Copy'}
            </button>
          </div>
        )}
        <div className="flex items-center gap-3">
          <button onClick={runTest} disabled={testing} className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground shadow-[0_8px_24px_-12px_rgba(197,251,80,0.55)] hover:bg-accent-hover disabled:bg-white/10 disabled:text-white/30 disabled:shadow-none transition">
            {testing ? 'Firing…' : 'Test snippet'}
          </button>
          {notice && <span className="text-xs text-emerald-200">{notice}</span>}
        </div>
      </Card>

      {/* Third-party web research */}
      <Card className="space-y-4">
        <div>
          <h2 className="text-sm font-medium text-white/85">Third-party signal research</h2>
          <p className="mt-1 text-xs text-white/45">
            Crawl a target account's site with Firecrawl and let the local LLM extract buying signals — funding, hiring surges, product launches, tech changes. These complement first-party website visits.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button onClick={runResearchNow} disabled={researching} className="rounded-xl border border-accent/40 bg-accent/10 px-4 py-2 text-sm font-semibold text-accent hover:bg-accent/20 disabled:opacity-40 transition">
            {researching ? 'Researching…' : 'Run web research'}
          </button>
          <span className="text-[11px] text-white/30">Researches your top-tier account. Uses Firecrawl + Ollama (mock-safe).</span>
        </div>
      </Card>

      {/* Live signal feed */}
      <Card className="overflow-hidden p-0">
        <div className="border-b border-white/10 px-4 py-3">
          <h2 className="text-sm font-medium text-white/85">Live signal feed</h2>
        </div>
        {signals.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-white/35">No signals yet. Install the snippet or hit “Test snippet”.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wide text-white/40">
                <th className="px-4 py-2.5 font-medium">Account</th>
                <th className="px-4 py-2.5 font-medium">Signal</th>
                <th className="px-4 py-2.5 font-medium">Source</th>
                <th className="px-4 py-2.5 font-medium">Pts</th>
                <th className="px-4 py-2.5 font-medium">When</th>
              </tr>
            </thead>
            <tbody>
              {pg.pageItems.map((s) => (
                <tr key={s.id} className="border-b border-white/10 last:border-0 hover:bg-white/5">
                  <td className="px-4 py-2.5 font-medium text-white/85">{s.account_name ?? s.account_id.slice(0, 10)}</td>
                  <td className="px-4 py-2.5 text-white/70">{s.signal_type.replace(/_/g, ' ')}</td>
                  <td className="px-4 py-2.5"><Pill tone={SOURCE_TONE[s.signal_source] ?? 'gray'}>{s.signal_source.replace(/_/g, ' ')}</Pill></td>
                  <td className="px-4 py-2.5 text-white/70">+{s.points_awarded}</td>
                  <td className="px-4 py-2.5 text-xs text-white/40">{timeAgo(s.occurred_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <Pagination {...pg} unit="signals" />
      </Card>

      <WhatsNext auto="Hot accounts are scored and routed to campaigns automatically as signals arrive." cta={{ label: 'Review Campaigns', href: '/plays' }} />
    </div>
  );
}
