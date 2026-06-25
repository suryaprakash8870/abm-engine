'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, Pill, Banner, LinkButton, WhatsNext } from '@/app/icp/ui';
import { usePagination, Pagination } from '@/lib/web/pagination';
import { getTal, finalizeTal, suppressAccount, type CurrentTal } from '@/lib/web/tal-api';

export default function TalPage() {
  const [tal, setTal] = useState<CurrentTal | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [tierFilter, setTierFilter] = useState<0 | 1 | 2 | 3>(0);

  // Suppression modal
  const [suppressTarget, setSuppressTarget] = useState<{ id: string; name: string | null; domain: string | null } | null>(null);
  const [suppressReason, setSuppressReason] = useState('existing_customer');

  const load = async () => {
    setLoading(true);
    const res = await getTal();
    if (res.ok) setTal(res.data ?? null);
    else setError(res.error?.message ?? 'Failed to load the TAL.');
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  const handleFinalize = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    const res = await finalizeTal();
    if (res.ok && res.data) {
      setNotice(`TAL v${res.data.version} finalized · ${res.data.account_count} accounts · ${res.data.suppressed_count} suppressed.`);
      await load();
    } else setError(res.error?.message ?? 'Finalize failed.');
    setBusy(false);
  };

  const handleSuppress = async () => {
    if (!suppressTarget) return;
    setBusy(true);
    const res = await suppressAccount({ account_id: suppressTarget.id, domain: suppressTarget.domain ?? undefined, reason: suppressReason });
    if (res.ok) {
      setSuppressTarget(null);
      setNotice('Account suppressed. Re-finalize to apply.');
    } else setError(res.error?.message ?? 'Suppression failed.');
    setBusy(false);
  };

  const tierPill = (tier: number) =>
    tier === 1 ? <Pill tone="green">Tier 1</Pill>
    : tier === 2 ? <Pill tone="amber">Tier 2</Pill>
    : <Pill tone="gray">Tier 3</Pill>;

  // Filter + paginate (hooks must run before any early return).
  const accounts = (tal?.accounts ?? []).filter((a) => tierFilter === 0 || a.tier === tierFilter);
  const pg = usePagination(accounts, 25);

  if (loading) return <p className="text-sm text-white/40">Loading target account list…</p>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h1 className="font-display text-2xl font-medium text-white">Target Account List</h1>
          {tal && <Pill tone="green">{tal.account_count} accounts</Pill>}
          {tal && <Pill tone="blue">v{tal.version}</Pill>}
          {tal && <Pill tone={tal.review_status === 'reviewed' ? 'green' : 'amber'}>{tal.review_status}</Pill>}
        </div>
        <div className="flex items-center gap-3">
          <a href="/api/v1/tal/export" className="text-sm text-white/55 hover:text-white transition">Export CSV ↓</a>
          <button
            onClick={handleFinalize}
            disabled={busy}
            className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground shadow-[0_8px_24px_-12px_rgba(197,251,80,0.55)] hover:bg-accent-hover disabled:bg-white/10 disabled:text-white/30 disabled:shadow-none transition"
          >
            {busy ? 'Working…' : tal ? 'Re-finalize' : 'Finalize TAL'}
          </button>
        </div>
      </div>

      {notice && (
        <div className="rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{notice}</div>
      )}
      {error && <Banner tone="red">{error}</Banner>}

      {/* Suppression modal */}
      {suppressTarget && (
        <Card className="space-y-4 border-amber-400/25 bg-amber-500/10">
          <p className="text-sm font-medium text-amber-200">
            Suppress <span className="text-white">{suppressTarget.name ?? suppressTarget.domain ?? suppressTarget.id.slice(0, 8)}</span> from the TAL
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {['existing_customer', 'closed_lost', 'do_not_contact', 'unsubscribed', 'manual'].map((r) => (
              <button
                key={r}
                onClick={() => setSuppressReason(r)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${suppressReason === r ? 'bg-accent text-accent-foreground' : 'border border-white/15 bg-white/5 text-white/60 hover:bg-white/10'}`}
              >
                {r.replace(/_/g, ' ')}
              </button>
            ))}
          </div>
          <div className="flex gap-3">
            <button onClick={handleSuppress} disabled={busy} className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground hover:bg-accent-hover disabled:bg-white/10 disabled:text-white/30 transition">
              {busy ? 'Saving…' : 'Suppress'}
            </button>
            <button onClick={() => setSuppressTarget(null)} className="text-sm text-white/40 hover:text-white transition">Cancel</button>
          </div>
        </Card>
      )}

      {!tal || tal.accounts.length === 0 ? (
        <Banner tone="blue">No TAL yet. Score some accounts (Engine 04), then click <strong>Finalize TAL</strong> to build the list.</Banner>
      ) : (
        <>
          <div className="flex items-center gap-2">
            {([0, 1, 2, 3] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTierFilter(t)}
                className={`rounded-lg px-3 py-1 text-xs font-medium transition ${tierFilter === t ? 'bg-white/15 text-white' : 'text-white/45 hover:text-white/80'}`}
              >
                {t === 0 ? 'All' : `Tier ${t}`}
              </button>
            ))}
          </div>

          <Card className="overflow-hidden p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wide text-white/40">
                  <th className="px-4 py-3 font-medium">Company</th>
                  <th className="px-4 py-3 font-medium">Domain</th>
                  <th className="px-4 py-3 font-medium">Tier</th>
                  <th className="px-4 py-3 font-medium">Score</th>
                  <th className="px-4 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {pg.pageItems.map((a) => (
                  <tr key={a.account_id} className="border-b border-white/10 last:border-0 hover:bg-white/5">
                    <td className="px-4 py-2.5 font-medium text-white/85">{a.name ?? '—'}</td>
                    <td className="px-4 py-2.5 text-white/60">{a.domain ?? '—'}</td>
                    <td className="px-4 py-2.5">{tierPill(a.tier)}</td>
                    <td className="px-4 py-2.5 tabular-nums text-white/70">{Math.round(a.score)}</td>
                    <td className="px-4 py-2.5 text-right">
                      <button
                        onClick={() => { setSuppressTarget({ id: a.account_id, name: a.name, domain: a.domain }); setSuppressReason('existing_customer'); }}
                        className="text-xs text-white/30 hover:text-white transition"
                      >
                        Suppress
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination {...pg} unit="accounts" />
          </Card>
        </>
      )}

      <WhatsNext auto="Accounts are scored and tiered automatically as data arrives. Tier 1 are your priority." cta={{ label: 'Map their Contacts', href: '/contacts' }} />
    </div>
  );
}
