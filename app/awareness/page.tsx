'use client';

import { useEffect, useState } from 'react';
import { Card, Pill, Banner, LinkButton } from '@/app/icp/ui';
import {
  getAwarenessFeed, listRoutingRules, createRoutingRule, updateRoutingRule,
  type FeedAccount, type RoutingRule,
} from '@/lib/web/awareness-api';

const STAGE_TONE: Record<string, 'gray' | 'blue' | 'amber' | 'green'> = {
  identified: 'gray', aware: 'blue', interested: 'blue', considering: 'amber', selecting: 'green',
};

function ScoreBar({ score }: { score: number }) {
  const tone = score >= 80 ? 'bg-emerald-400' : score >= 40 ? 'bg-amber-400' : 'bg-white/30';
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-white/10">
        <div className={`h-full ${tone}`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-sm font-medium text-white/85 tabular-nums">{score}</span>
    </div>
  );
}

export default function AwarenessPage() {
  const [feed, setFeed] = useState<FeedAccount[]>([]);
  const [rules, setRules] = useState<RoutingRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newRule, setNewRule] = useState('');
  const [minScore, setMinScore] = useState(60);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const [f, r] = await Promise.all([getAwarenessFeed(), listRoutingRules()]);
    if (f.ok) setFeed(f.data ?? []);
    else setError(f.error?.message ?? 'Failed to load feed.');
    if (r.ok) setRules(r.data ?? []);
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  const addRule = async () => {
    if (!newRule.trim()) return;
    setBusy(true);
    const res = await createRoutingRule({ name: newRule.trim(), trigger_config: { min_score: minScore }, actions: ['slack_alert', 'crm_task'] });
    if (res.ok) { setNewRule(''); await load(); } else setError(res.error?.message ?? 'Could not create rule.');
    setBusy(false);
  };

  const toggle = async (rule: RoutingRule) => {
    const res = await updateRoutingRule(rule.id, { is_active: !rule.isActive });
    if (res.ok) await load();
  };

  if (loading) return <p className="text-sm text-white/40">Loading awareness…</p>;

  const hot = feed.filter((a) => a.score >= 60).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <h1 className="font-display text-2xl font-medium text-white">Awareness</h1>
        <Pill tone="green">{feed.length} scored</Pill>
        {hot > 0 && <Pill tone="amber">{hot} hot</Pill>}
      </div>

      {error && <Banner tone="red">{error}</Banner>}

      {/* Hot accounts feed */}
      <Card className="overflow-hidden p-0">
        <div className="border-b border-white/10 px-4 py-3"><h2 className="text-sm font-medium text-white/85">Hot accounts</h2></div>
        {feed.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-white/35">No awareness scores yet. Signals from Engine 07 build these.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wide text-white/40">
                <th className="px-4 py-2.5 font-medium">Account</th>
                <th className="px-4 py-2.5 font-medium">Score</th>
                <th className="px-4 py-2.5 font-medium">Stage</th>
                <th className="px-4 py-2.5 font-medium">7d</th>
                <th className="px-4 py-2.5 font-medium">Recent signals</th>
              </tr>
            </thead>
            <tbody>
              {feed.map((a) => (
                <tr key={a.account_id} className="border-b border-white/10 last:border-0 hover:bg-white/5">
                  <td className="px-4 py-2.5">
                    <p className="font-medium text-white/85">{a.name ?? a.account_id.slice(0, 10)}</p>
                    <p className="text-xs text-white/40">{a.domain ?? '—'}{a.tier ? ` · Tier ${a.tier}` : ''}</p>
                  </td>
                  <td className="px-4 py-2.5"><ScoreBar score={a.score} /></td>
                  <td className="px-4 py-2.5"><Pill tone={STAGE_TONE[a.stage] ?? 'gray'}>{a.stage}</Pill></td>
                  <td className="px-4 py-2.5 tabular-nums">
                    {a.score_7d_change > 0 ? <span className="text-emerald-300">▲ {a.score_7d_change}</span>
                      : a.score_7d_change < 0 ? <span className="text-red-300">▼ {Math.abs(a.score_7d_change)}</span>
                      : <span className="text-white/30">—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-white/50">
                    {a.top_signals.length ? a.top_signals.map((s) => s.signal_type.replace(/_/g, ' ')).join(', ') : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {/* Routing rules */}
      <Card className="space-y-4">
        <h2 className="text-sm font-medium text-white/85">Signal routing rules</h2>
        <div className="flex flex-wrap items-center gap-2">
          <input value={newRule} onChange={(e) => setNewRule(e.target.value)} placeholder="Rule name (e.g. Hot account → SDR)"
            className="flex-1 min-w-[180px] rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white/85 placeholder:text-white/30" />
          <label className="flex items-center gap-1.5 text-xs text-white/45">score ≥
            <input type="number" value={minScore} onChange={(e) => setMinScore(Number(e.target.value))}
              className="w-16 rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-white/85" />
          </label>
          <button onClick={addRule} disabled={busy || !newRule.trim()} className="rounded-xl bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-400 disabled:bg-white/10 disabled:text-white/30 transition">Add rule</button>
        </div>
        {rules.length === 0 ? (
          <p className="text-xs text-white/35">No routing rules yet. Add one to alert reps when accounts heat up.</p>
        ) : (
          <div className="space-y-2">
            {rules.map((r) => (
              <div key={r.id} className="flex items-center justify-between rounded-lg border border-white/10 px-3 py-2">
                <div>
                  <p className="text-sm text-white/85">{r.name}</p>
                  <p className="text-xs text-white/40">
                    {r.triggerConfig.min_score ? `score ≥ ${r.triggerConfig.min_score}` : 'any score'}
                    {r.triggerConfig.stage ? ` · ${r.triggerConfig.stage}` : ''} → {r.actions.join(', ')}
                  </p>
                </div>
                <button onClick={() => toggle(r)} className={`rounded-full px-3 py-1 text-xs transition ${r.isActive ? 'bg-emerald-500/20 text-emerald-200' : 'bg-white/10 text-white/40'}`}>
                  {r.isActive ? 'Active' : 'Off'}
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className="flex items-center justify-between border-t border-white/10 pt-6">
        <LinkButton href="/signals">← Back to Signals</LinkButton>
        <span className="text-sm text-white/35">Next: orchestrator (Engine 09)</span>
      </div>
    </div>
  );
}
