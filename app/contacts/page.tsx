'use client';

import { useEffect, useRef, useState } from 'react';
import { Card, Pill, Banner, LinkButton } from '@/app/icp/ui';
import { listContacts, sourceContacts, sourceBatch, type AccountWithContacts } from '@/lib/web/contacts-api';

export default function ContactsPage() {
  const [accounts, setAccounts] = useState<AccountWithContacts[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = async () => {
    const res = await listContacts();
    if (res.ok) setAccounts(res.data ?? []);
    else setError(res.error?.message ?? 'Failed to load accounts.');
    setLoading(false);
  };

  useEffect(() => {
    void load();
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  // Sourcing is async (queue); poll briefly so counts fill in without a manual refresh.
  const pollFor = (cycles = 6) => {
    if (pollRef.current) clearInterval(pollRef.current);
    let n = 0;
    pollRef.current = setInterval(() => {
      n += 1;
      void load();
      if (n >= cycles && pollRef.current) clearInterval(pollRef.current);
    }, 2500);
  };

  const handleSourceOne = async (accountId: string) => {
    setBusy(true); setError(null); setNotice(null);
    const res = await sourceContacts(accountId);
    if (res.ok) { setNotice('Sourcing started — contacts will appear shortly.'); pollFor(); }
    else setError(res.error?.message ?? 'Sourcing failed.');
    setBusy(false);
  };

  const handleSourceBatch = async () => {
    setBusy(true); setError(null); setNotice(null);
    const res = await sourceBatch();
    if (res.ok && res.data) { setNotice(res.data.message); pollFor(8); }
    else setError(res.error?.message ?? 'Batch sourcing failed.');
    setBusy(false);
  };

  if (loading) return <p className="text-sm text-white/40">Loading accounts…</p>;

  const tier1 = accounts.filter((a) => a.tier === 1);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h1 className="font-display text-2xl font-medium text-white">Buying Committees</h1>
          <Pill tone="green">{accounts.length} accounts</Pill>
        </div>
        <button
          onClick={handleSourceBatch}
          disabled={busy || tier1.length === 0}
          className="rounded-xl bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-400 disabled:bg-white/10 disabled:text-white/30 transition"
        >
          {busy ? 'Working…' : `Source all Tier 1 (${tier1.length})`}
        </button>
      </div>

      {notice && (
        <div className="rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{notice}</div>
      )}
      {error && <Banner tone="red">{error}</Banner>}

      {accounts.length === 0 ? (
        <Banner tone="blue">No Tier-1/2 accounts yet. Finalize a TAL (Engine 05) first, then source contacts here.</Banner>
      ) : (
        <Card className="overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wide text-white/40">
                <th className="px-4 py-3 font-medium">Company</th>
                <th className="px-4 py-3 font-medium">Tier</th>
                <th className="px-4 py-3 font-medium">Contacts</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a.account_id} className="border-b border-white/10 last:border-0 hover:bg-white/5">
                  <td className="px-4 py-2.5">
                    <p className="font-medium text-white/85">{a.name ?? '—'}</p>
                    <p className="text-xs text-white/40">{a.domain ?? '—'}</p>
                  </td>
                  <td className="px-4 py-2.5">
                    {a.tier === 1 ? <Pill tone="green">Tier 1</Pill> : <Pill tone="amber">Tier 2</Pill>}
                  </td>
                  <td className="px-4 py-2.5">
                    {a.contact_count > 0 ? <Pill tone="blue">{a.contact_count} mapped</Pill> : <span className="text-xs text-white/35">none yet</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="flex items-center justify-end gap-3">
                      {a.contact_count > 0 && <LinkButton href={`/contacts/${a.account_id}`}>View map →</LinkButton>}
                      <button onClick={() => handleSourceOne(a.account_id)} disabled={busy} className="text-xs text-white/40 hover:text-white transition">
                        {a.contact_count > 0 ? 'Re-source' : 'Source'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <div className="flex items-center justify-between border-t border-white/10 pt-6">
        <LinkButton href="/tal">← Back to TAL</LinkButton>
        <span className="text-sm text-white/35">Next: signals (Engine 07)</span>
      </div>
    </div>
  );
}
