'use client';

import { useEffect, useState } from 'react';
import { Card, Pill, Banner, LinkButton } from '@/app/icp/ui';
import { getTrackingToken, getRecentSignals, fireTestSignal, type TokenInfo, type RecentSignal } from '@/lib/web/signals-api';

const SOURCE_TONE: Record<string, 'green' | 'amber' | 'blue' | 'gray'> = {
  website: 'blue',
  crm_webhook: 'green',
  email_webhook: 'amber',
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
          <button onClick={runTest} disabled={testing} className="rounded-xl bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-400 disabled:bg-white/10 disabled:text-white/30 transition">
            {testing ? 'Firing…' : 'Test snippet'}
          </button>
          {notice && <span className="text-xs text-emerald-200">{notice}</span>}
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
              {signals.map((s) => (
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
      </Card>

      <div className="flex items-center justify-between border-t border-white/10 pt-6">
        <LinkButton href="/contacts">← Back to Contacts</LinkButton>
        <span className="text-sm text-white/35">Next: awareness scoring (Engine 08)</span>
      </div>
    </div>
  );
}
