'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { Card, Pill, Banner, LinkButton } from '@/app/icp/ui';
import { getAccountContacts, updateContactRole, type AccountContacts, type ContactCard, type StakeholderRole } from '@/lib/web/contacts-api';

const COLUMNS: { role: StakeholderRole; label: string; tone: 'green' | 'amber' | 'blue' }[] = [
  { role: 'decision_maker', label: 'Decision Maker', tone: 'green' },
  { role: 'champion', label: 'Champion', tone: 'blue' },
  { role: 'influencer', label: 'Influencer', tone: 'amber' },
];

function emailPill(status: string | null) {
  if (status === 'valid') return <Pill tone="green">✓ verified</Pill>;
  if (status === 'risky') return <Pill tone="amber">risky</Pill>;
  if (status === 'invalid') return <Pill tone="red">invalid</Pill>;
  return <Pill tone="gray">unverified</Pill>;
}

export default function StakeholderMapPage() {
  const { accountId } = useParams<{ accountId: string }>();
  const [data, setData] = useState<AccountContacts | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await getAccountContacts(accountId);
    if (res.ok) setData(res.data ?? null);
    else setError(res.error?.message ?? 'Failed to load contacts.');
    setLoading(false);
  }, [accountId]);

  useEffect(() => { void load(); }, [load]);

  const move = async (contactId: string, role: StakeholderRole) => {
    const res = await updateContactRole(contactId, role);
    if (res.ok) await load();
    else setError(res.error?.message ?? 'Could not move contact.');
  };

  if (loading) return <p className="text-sm text-white/40">Loading stakeholder map…</p>;

  const byRole = (r: StakeholderRole): ContactCard[] =>
    r === 'decision_maker' ? data?.decision_makers ?? []
    : r === 'champion' ? data?.champions ?? []
    : data?.influencers ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h1 className="font-display text-2xl font-medium text-white">Stakeholder Map</h1>
          {data && <Pill tone="green">{data.total} contacts</Pill>}
        </div>
        <LinkButton href="/contacts">← All accounts</LinkButton>
      </div>

      {error && <Banner tone="red">{error}</Banner>}

      {!data || data.total === 0 ? (
        <Banner tone="blue">No contacts for this account yet. Source them from the Contacts list.</Banner>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          {COLUMNS.map((col) => (
            <div key={col.role} className="space-y-3">
              <div className="flex items-center gap-2">
                <Pill tone={col.tone}>{col.label}</Pill>
                <span className="text-xs text-white/40">{byRole(col.role).length}</span>
              </div>
              {byRole(col.role).length === 0 ? (
                <p className="rounded-xl border border-dashed border-white/10 px-3 py-6 text-center text-xs text-white/30">none</p>
              ) : (
                byRole(col.role).map((c) => (
                  <Card key={c.id} className="space-y-2 p-3.5">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium text-white/90">{c.full_name}</p>
                        <p className="text-xs text-white/50">{c.title ?? '—'}</p>
                      </div>
                      {c.flagged_for_review && <Pill tone="amber">review</Pill>}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {emailPill(c.email_status)}
                      {c.linkedin_url && (
                        <a href={c.linkedin_url} target="_blank" rel="noreferrer" className="text-xs text-blue-300 hover:text-blue-200">in →</a>
                      )}
                    </div>
                    {c.email && <p className="truncate text-xs text-white/45">{c.email}</p>}
                    <div className="flex gap-1.5 pt-1">
                      {COLUMNS.filter((o) => o.role !== col.role).map((o) => (
                        <button
                          key={o.role}
                          onClick={() => move(c.id, o.role)}
                          className="rounded-md border border-white/10 px-2 py-0.5 text-[11px] text-white/45 hover:bg-white/10 hover:text-white transition"
                        >
                          → {o.label}
                        </button>
                      ))}
                    </div>
                  </Card>
                ))
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
