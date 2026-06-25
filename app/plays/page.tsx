'use client';

import { useEffect, useState } from 'react';
import { Card, Pill, Banner, WhatsNext } from '@/app/icp/ui';
import { usePagination, Pagination } from '@/lib/web/pagination';
import { getPlayFeed, recordPlayOutcome, snoozePlay, generateDraft, type Play } from '@/lib/web/plays-api';

const STATUS_TONE: Record<string, 'gray' | 'blue' | 'amber' | 'green' | 'red'> = {
  fired: 'green', enrolled: 'blue', snoozed: 'amber', suppressed: 'gray',
};

export default function PlaysPage() {
  const [plays, setPlays] = useState<Play[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draftFor, setDraftFor] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ subject_lines: string[]; body: string; model_used: string } | null>(null);
  const [draftSubject, setDraftSubject] = useState(0);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const res = await getPlayFeed();
    if (res.ok) setPlays(res.data ?? []);
    else setError(res.error?.message ?? 'Failed to load plays.');
    setLoading(false);
  };
  useEffect(() => { void load(); }, []);

  const outcome = async (id: string, o: string) => {
    const res = await recordPlayOutcome(id, o);
    if (res.ok) await load(); else setError(res.error?.message ?? 'Could not record outcome.');
  };
  const snooze = async (id: string) => {
    const res = await snoozePlay(id, 7);
    if (res.ok) await load(); else setError(res.error?.message ?? 'Could not snooze.');
  };
  const openDraft = async (id: string) => {
    setBusy(true); setDraftFor(id); setDraft(null); setDraftSubject(0);
    const res = await generateDraft(id);
    if (res.ok && res.data) setDraft(res.data); else setError(res.error?.message ?? 'Draft failed.');
    setBusy(false);
  };

  const pg = usePagination(plays, 25);

  if (loading) return <p className="text-sm text-white/40">Loading play queue…</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <h1 className="font-display text-2xl font-medium text-white">Campaigns</h1>
        <Pill tone="green">{plays.length} plays</Pill>
      </div>

      {error && <Banner tone="red">{error}</Banner>}

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        {/* Play list */}
        <Card className="overflow-hidden p-0">
          {plays.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-white/35">No plays yet. Awareness triggers (stage change / hot) fire these.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wide text-white/40">
                  <th className="px-4 py-2.5 font-medium">Play</th>
                  <th className="px-4 py-2.5 font-medium">Account</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {pg.pageItems.map((p) => (
                  <tr key={p.id} className="border-b border-white/10 last:border-0 hover:bg-white/5 align-top">
                    <td className="px-4 py-2.5">
                      <p className="font-medium text-white/85">{p.play_type.replace(/_/g, ' ')}</p>
                      <p className="text-xs text-white/40">{p.trigger_type.replace('account.', '')} · {p.execution_method.replace(/_/g, ' ')}</p>
                    </td>
                    <td className="px-4 py-2.5">
                      <p className="text-white/80">{p.account_name ?? p.account_id.slice(0, 8)}</p>
                      <p className="text-xs text-white/40">{p.tier ? `Tier ${p.tier}` : ''}</p>
                    </td>
                    <td className="px-4 py-2.5">
                      <Pill tone={STATUS_TONE[p.status] ?? 'gray'}>{p.outcome ?? p.status}</Pill>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex flex-wrap justify-end gap-2 text-xs">
                        {p.execution_method === 'crm_task_slack' && (
                          <button onClick={() => openDraft(p.id)} className="rounded-md border border-accent/40 px-2 py-0.5 text-accent hover:bg-accent-soft transition">Draft</button>
                        )}
                        <button onClick={() => outcome(p.id, 'contacted')} className="rounded-md border border-white/10 px-2 py-0.5 text-white/50 hover:bg-white/10 transition">Contacted</button>
                        <button onClick={() => outcome(p.id, 'not_interested')} className="rounded-md border border-white/10 px-2 py-0.5 text-white/50 hover:bg-white/10 transition">Not interested</button>
                        <button onClick={() => snooze(p.id)} className="rounded-md border border-white/10 px-2 py-0.5 text-white/50 hover:bg-white/10 transition">Snooze</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <Pagination {...pg} unit="plays" />
        </Card>

        {/* Draft panel */}
        {draftFor && (
          <Card className="space-y-3 self-start">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-white/85">AI email draft</h2>
              <button onClick={() => { setDraftFor(null); setDraft(null); }} className="text-xs text-white/40 hover:text-white">close</button>
            </div>
            {busy ? (
              <p className="text-sm text-white/40">Drafting…</p>
            ) : draft ? (
              <>
                <div className="flex gap-1">
                  {draft.subject_lines.map((s, i) => (
                    <button key={i} onClick={() => setDraftSubject(i)} className={`flex-1 truncate rounded-md px-2 py-1 text-[11px] transition ${draftSubject === i ? 'bg-accent-soft text-accent' : 'bg-white/5 text-white/50 hover:bg-white/10'}`}>{i + 1}</button>
                  ))}
                </div>
                <p className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm font-medium text-white/85">{draft.subject_lines[draftSubject]}</p>
                <textarea readOnly value={draft.body} rows={9} className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-white/70" />
                <p className="text-[11px] text-white/30">model: {draft.model_used}</p>
              </>
            ) : null}
          </Card>
        )}
      </div>

      <WhatsNext auto="Fired campaigns sync to your CRM and ping you on Telegram. Results roll up in Analytics." cta={{ label: 'See Analytics', href: '/insights' }} />
    </div>
  );
}
