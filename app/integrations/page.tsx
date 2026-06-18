'use client';

import { useEffect, useState } from 'react';
import { Card, Pill, Banner, LinkButton } from '@/app/icp/ui';
import {
  getCrmConnections, connectHubspot, disconnectHubspot, getSyncLog,
  type CrmConnection, type SyncLogRow,
} from '@/lib/web/crm-api';

const OUTCOME_TONE: Record<string, 'green' | 'red' | 'amber'> = {
  success: 'green', failed: 'red', dead_lettered: 'amber',
};

export default function IntegrationsPage() {
  const [conns, setConns] = useState<CrmConnection[]>([]);
  const [log, setLog] = useState<SyncLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    const [c, l] = await Promise.all([getCrmConnections(), getSyncLog()]);
    if (c.ok) setConns(c.data ?? []);
    if (l.ok) setLog(l.data ?? []);
    else if (!c.ok) setError(c.error?.message ?? 'Failed to load.');
    setLoading(false);
  };
  useEffect(() => { void load(); }, []);

  const hubspot = conns.find((c) => c.crm_type === 'hubspot');
  const connected = hubspot?.status === 'connected';

  const toggle = async () => {
    setBusy(true); setError(null);
    const res = connected ? await disconnectHubspot() : await connectHubspot();
    if (res.ok) await load(); else setError(res.error?.message ?? 'Action failed.');
    setBusy(false);
  };

  if (loading) return <p className="text-sm text-white/40">Loading integrations…</p>;

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-medium text-white">Integrations</h1>
      {error && <Banner tone="red">{error}</Banner>}

      {/* CRM connection */}
      <Card className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-500/15 text-lg">🟧</div>
          <div>
            <p className="font-medium text-white/90">HubSpot</p>
            <p className="text-xs text-white/45">
              {connected ? `Connected · ${hubspot?.portal_id ?? ''}` : 'Not connected'}
            </p>
          </div>
          {connected ? <Pill tone="green">connected</Pill> : <Pill tone="gray">disconnected</Pill>}
        </div>
        <button
          onClick={toggle}
          disabled={busy}
          className={`rounded-xl px-4 py-2 text-sm font-medium transition disabled:opacity-50 ${connected ? 'border border-white/15 text-white/70 hover:bg-white/10' : 'bg-blue-500 text-white hover:bg-blue-400'}`}
        >
          {busy ? '…' : connected ? 'Disconnect' : 'Connect HubSpot'}
        </button>
      </Card>

      {/* Sync log */}
      <Card className="overflow-hidden p-0">
        <div className="border-b border-white/10 px-4 py-3"><h2 className="text-sm font-medium text-white/85">CRM Sync Log</h2></div>
        {log.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-white/35">No CRM writes yet. They appear as the pipeline runs.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wide text-white/40">
                <th className="px-4 py-2.5 font-medium">Record</th>
                <th className="px-4 py-2.5 font-medium">Operation</th>
                <th className="px-4 py-2.5 font-medium">Outcome</th>
                <th className="px-4 py-2.5 font-medium">When</th>
              </tr>
            </thead>
            <tbody>
              {log.map((r) => (
                <tr key={r.id} className="border-b border-white/10 last:border-0 hover:bg-white/5">
                  <td className="px-4 py-2.5">
                    <p className="text-white/80">{r.record_type}</p>
                    <p className="font-mono text-xs text-white/35">{r.record_id.slice(0, 16)}…</p>
                  </td>
                  <td className="px-4 py-2.5 text-white/60">{r.operation}</td>
                  <td className="px-4 py-2.5"><Pill tone={OUTCOME_TONE[r.outcome] ?? 'gray'}>{r.outcome}</Pill></td>
                  <td className="px-4 py-2.5 text-xs text-white/40">{new Date(r.synced_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <div className="flex items-center justify-between border-t border-white/10 pt-6">
        <LinkButton href="/plays">← Back to Plays</LinkButton>
        <span className="text-sm text-white/35">Next: GTM flywheel (Engine 11)</span>
      </div>
    </div>
  );
}
