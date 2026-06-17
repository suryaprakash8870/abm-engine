'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Card, Pill, Banner, LinkButton } from '@/app/icp/ui';
import { overrideTier } from '@/lib/web/scoring-api';

interface ScoredRow {
  id: string;
  name: string | null;
  domain: string;
  totalScore: number;
  tier: number | null;
  criterionScores: { key: string; match: 0 | 0.5 | 1; weight: number; contribution: number }[];
}

export default function ScoredAccountsPage() {
  const { icpId } = useParams<{ icpId: string }>();
  const [accounts, setAccounts] = useState<ScoredRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [overrideTarget, setOverrideTarget] = useState<string | null>(null);
  const [overrideTierVal, setOverrideTierVal] = useState<1 | 2 | 3>(2);
  const [overrideReason, setOverrideReason] = useState('');
  const [overriding, setOverriding] = useState(false);

  const load = async () => {
    setLoading(true);
    const res = await fetch('/api/v1/scoring/accounts');
    if (res.ok) {
      const body = await res.json();
      setAccounts(body.data ?? []);
    } else setError('Failed to load scored accounts.');
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  const handleOverride = async () => {
    if (!overrideTarget || !overrideReason.trim()) return;
    setOverriding(true);
    const res = await overrideTier(overrideTarget, overrideTierVal, overrideReason);
    if (res.ok) {
      setOverrideTarget(null);
      setOverrideReason('');
      await load();
    } else setError(res.error?.message ?? 'Override failed.');
    setOverriding(false);
  };

  const tierPill = (tier: number | null) =>
    tier === 1 ? <Pill tone="green">Tier 1</Pill>
    : tier === 2 ? <Pill tone="amber">Tier 2</Pill>
    : tier === 3 ? <Pill tone="gray">Tier 3</Pill>
    : <Pill tone="gray">Untiered</Pill>;

  if (loading) return <p className="text-sm text-white/40">Loading scored accounts…</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-medium text-white">Scored Accounts</h1>
          <p className="mt-1 text-sm text-white/55">Tier 1 = best fit (score ≥ 70) · Promote or demote with a reason.</p>
        </div>
        <LinkButton href={`/scoring/${icpId}`}>← Formula</LinkButton>
      </div>

      {error && <Banner tone="red">{error}</Banner>}

      {/* Override modal */}
      {overrideTarget && (
        <Card className="space-y-4 border-amber-400/25 bg-amber-500/10">
          <p className="text-sm font-medium text-amber-200">Override tier for account <code className="rounded bg-white/10 px-1">{overrideTarget.slice(0, 8)}…</code></p>
          <div className="flex items-center gap-3">
            {([1, 2, 3] as const).map((t) => (
              <button
                key={t}
                onClick={() => setOverrideTierVal(t)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${overrideTierVal === t ? 'bg-blue-500 text-white' : 'border border-white/15 bg-white/5 text-white/60 hover:bg-white/10'}`}
              >
                Tier {t}
              </button>
            ))}
          </div>
          <input
            type="text"
            placeholder="Reason (required)…"
            value={overrideReason}
            onChange={(e) => setOverrideReason(e.target.value)}
            className="w-full rounded-xl border border-white/15 bg-white/[0.06] px-3.5 py-2.5 text-sm text-white placeholder-white/30 outline-none focus:border-white/30"
          />
          <div className="flex gap-3">
            <button onClick={handleOverride} disabled={overriding || !overrideReason.trim()} className="rounded-xl bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-400 disabled:bg-white/10 disabled:text-white/30 transition">
              {overriding ? 'Saving…' : 'Apply override'}
            </button>
            <button onClick={() => setOverrideTarget(null)} className="text-sm text-white/40 hover:text-white transition">Cancel</button>
          </div>
        </Card>
      )}

      {accounts.length === 0 ? (
        <Banner tone="blue">No scored accounts yet. Run scoring from the formula page.</Banner>
      ) : (
        <Card className="overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wide text-white/40">
                <th className="px-4 py-3 font-medium">Company</th>
                <th className="px-4 py-3 font-medium">Score</th>
                <th className="px-4 py-3 font-medium">Tier</th>
                <th className="px-4 py-3 font-medium hidden md:table-cell">Top criteria</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a.id} className="border-b border-white/10 last:border-0 hover:bg-white/5">
                  <td className="px-4 py-2.5">
                    <p className="font-medium text-white/85">{a.name ?? '—'}</p>
                    <p className="text-xs text-white/40">{a.domain}</p>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-white/10">
                        <div
                          className={`h-full rounded-full ${a.totalScore >= 70 ? 'bg-emerald-400' : a.totalScore >= 40 ? 'bg-amber-400' : 'bg-white/30'}`}
                          style={{ width: `${a.totalScore}%` }}
                        />
                      </div>
                      <span className="tabular-nums text-white/70">{Math.round(a.totalScore)}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5">{tierPill(a.tier)}</td>
                  <td className="px-4 py-2.5 hidden md:table-cell">
                    <div className="flex flex-wrap gap-1">
                      {a.criterionScores
                        .filter((c) => c.contribution > 0)
                        .sort((a, b) => b.contribution - a.contribution)
                        .slice(0, 2)
                        .map((c) => (
                          <span key={c.key} className="rounded-md bg-white/[0.05] px-1.5 py-0.5 text-xs text-white/60">
                            {c.key} +{c.contribution}
                          </span>
                        ))}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      onClick={() => { setOverrideTarget(a.id); setOverrideTierVal(a.tier === 1 ? 2 : 1); }}
                      className="text-xs text-white/30 hover:text-white transition"
                    >
                      Override
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
