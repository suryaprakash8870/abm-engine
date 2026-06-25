'use client';

import { useEffect, useState } from 'react';
import { Card, Pill, Banner, WhatsNext } from '@/app/icp/ui';
import { usePagination, Pagination } from '@/lib/web/pagination';
import {
  getCrmConnections, connectHubspot, disconnectHubspot, getSyncLog,
  getIntegrationKeys, saveIntegrationKey, removeIntegrationKey, sendTelegramTest, importFromCrm,
  type CrmConnection, type SyncLogRow, type CrmImportSummary,
} from '@/lib/web/crm-api';

const OUTCOME_TONE: Record<string, 'green' | 'red' | 'amber'> = {
  success: 'green', failed: 'red', dead_lettered: 'amber',
};

/** Pull a readable error string out of a failed sync-log row's stored detail. */
function syncErrorText(detail: unknown): string {
  if (!detail || typeof detail !== 'object') return 'write failed';
  const d = detail as Record<string, unknown>;
  const parts: string[] = [];
  if (typeof d.error === 'string') parts.push(d.error);
  const inner = d.detail;
  if (typeof inner === 'string') parts.push(inner);
  else if (inner && typeof inner === 'object') {
    const di = inner as Record<string, unknown>;
    if (typeof di.message === 'string') parts.push(di.message);
    else parts.push(JSON.stringify(inner).slice(0, 240));
  }
  return parts.join(' — ') || 'write failed';
}

type Tab = 'connectors' | 'log' | 'api' | 'mcp';

const TABS: { id: Tab; label: string }[] = [
  { id: 'connectors', label: 'Connectors' },
  { id: 'log', label: 'Sync Log' },
  { id: 'api', label: 'API' },
  { id: 'mcp', label: 'MCP' },
];

// BYO-key providers grouped by purpose.
const DATA_PROVIDERS = [
  { slug: 'apollo', name: 'Apollo', desc: 'Company sourcing + contact & email finder (Engines 02 · 06)' },
  { slug: 'clearbit', name: 'Clearbit', desc: 'Firmographic enrichment (Engine 03)' },
  { slug: 'clay', name: 'Clay', desc: 'Waterfall enrichment provider (Engine 03)' },
  { slug: 'ai-ark', name: 'AI-Ark', desc: 'B2B company + people data, enrichment API (Engines 02 · 03)' },
];
const RESEARCH_PROVIDERS = [
  { slug: 'firecrawl', name: 'Firecrawl', desc: 'Crawl sites + news for 3rd-party signals (Engines 03 · 07)' },
  { slug: 'theirstack', name: 'TheirStack', desc: 'Job postings + technographics → hiring & tech signals (Engine 07)' },
];
const DELIVERY_PROVIDERS = [
  { slug: 'slack', name: 'Slack', desc: 'Hot-account + play alerts (Engine 09)' },
  { slug: 'resend', name: 'Resend', desc: 'Send AI-drafted play emails (Engine 09)' },
  { slug: 'telegram', name: 'Telegram', desc: 'Bot alerts on fired plays. Key format: botToken;chatId (Engine 09)' },
];

export default function IntegrationsPage() {
  const [tab, setTab] = useState<Tab>('connectors');
  const [conns, setConns] = useState<CrmConnection[]>([]);
  const [log, setLog] = useState<SyncLogRow[]>([]);
  const [configured, setConfigured] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importSummary, setImportSummary] = useState<CrmImportSummary | null>(null);

  const runImport = async () => {
    setImporting(true); setError(null); setImportSummary(null);
    const r = await importFromCrm();
    if (r.ok && r.data) setImportSummary(r.data);
    else setError(r.error?.message ?? 'Import failed.');
    setImporting(false);
  };

  const load = async () => {
    const [c, l, k] = await Promise.all([getCrmConnections(), getSyncLog(), getIntegrationKeys()]);
    if (c.ok) setConns(c.data ?? []);
    if (l.ok) setLog(l.data ?? []);
    if (k.ok) setConfigured(k.data?.configured ?? []);
    if (!c.ok && !l.ok) setError(c.error?.message ?? 'Failed to load.');
    setLoading(false);
  };
  useEffect(() => { void load(); }, []);

  const [failedOnly, setFailedOnly] = useState(false);
  const filteredLog = failedOnly ? log.filter((r) => r.outcome !== 'success') : log;
  const failedCount = log.filter((r) => r.outcome !== 'success').length;
  const pg = usePagination(filteredLog, 25);

  const hubspot = conns.find((c) => c.crm_type === 'hubspot');
  const connected = hubspot?.status === 'connected';

  const toggleHubspot = async () => {
    setBusy(true); setError(null);
    const res = connected ? await disconnectHubspot() : await connectHubspot();
    if (res.ok) await load(); else setError(res.error?.message ?? 'Action failed.');
    setBusy(false);
  };

  const saveKey = async (provider: string, key: string) => {
    const res = await saveIntegrationKey(provider, key);
    if (res.ok) setConfigured((prev) => [...new Set([...prev, provider])]);
    else setError(res.error?.message ?? 'Could not save key.');
  };
  const removeKey = async (provider: string) => {
    const res = await removeIntegrationKey(provider);
    if (res.ok) setConfigured((prev) => prev.filter((p) => p !== provider));
    else setError(res.error?.message ?? 'Could not remove key.');
  };

  if (loading) return <p className="text-sm text-white/40">Loading integrations…</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-medium text-white">Data Sources</h1>
        <p className="mt-1 text-sm text-white/55">Connect your CRM, data, and delivery tools — or plug in your own provider keys.</p>
      </div>

      {error && <Banner tone="red">{error}</Banner>}

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 border-b border-white/[0.08]">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`relative px-3.5 py-2 text-[13px] font-medium transition ${
              tab === t.id ? 'text-accent' : 'text-white/50 hover:text-white/80'
            }`}
          >
            {t.label}
            {tab === t.id && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-accent" />}
          </button>
        ))}
      </div>

      {/* Connectors */}
      {tab === 'connectors' && (
        <div className="space-y-7">
          <ConnectorGroup title="CRM" caption="Your system of record — all writes flow here (Engine 10)">
            <Card className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-500/15 text-lg">🟧</div>
                <div>
                  <p className="font-medium text-white/90">HubSpot</p>
                  <p className="text-xs text-white/45">{connected ? `Connected · ${hubspot?.portal_id ?? ''}` : 'Two-way sync + deal webhooks'}</p>
                </div>
                {connected ? <Pill tone="green">connected</Pill> : <Pill tone="gray">not connected</Pill>}
              </div>
              <button
                onClick={toggleHubspot}
                disabled={busy}
                className={`rounded-xl px-4 py-2 text-sm font-semibold transition disabled:opacity-50 ${
                  connected ? 'border border-white/15 font-medium text-white/70 hover:bg-white/10' : 'bg-accent text-accent-foreground shadow-[0_8px_24px_-12px_rgba(197,251,80,0.55)] hover:bg-accent-hover'
                }`}
              >
                {busy ? '…' : connected ? 'Disconnect' : 'Connect HubSpot'}
              </button>
            </Card>
            <Card className="flex items-center justify-between opacity-70">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-500/15 text-lg">☁️</div>
                <div>
                  <p className="font-medium text-white/90">Salesforce</p>
                  <p className="text-xs text-white/45">Same Engine-10 adapter pattern</p>
                </div>
              </div>
              <Pill tone="gray">coming soon</Pill>
            </Card>

            {/* Import (HubSpot as INPUT) */}
            <Card className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium text-white/90">Import from HubSpot</p>
                  <p className="text-xs text-white/45">Pull companies, contacts & deals in. Closed-won/lost deals teach your ICP.</p>
                </div>
                <button onClick={runImport} disabled={importing} className="shrink-0 rounded-xl border border-accent/40 bg-accent/10 px-4 py-2 text-sm font-medium text-accent transition hover:bg-accent/20 disabled:opacity-40">
                  {importing ? 'Importing…' : 'Import now'}
                </button>
              </div>
              {importSummary && (
                <div className="flex flex-wrap gap-x-5 gap-y-1.5 border-t border-white/[0.06] pt-3 text-[12.5px]">
                  <span className="text-white/45">Source <span className="text-white/75">{importSummary.mode === 'hubspot' ? 'live' : 'sample'}</span></span>
                  <span className="text-white/45">Companies <span className="text-white/80">{importSummary.companies}</span></span>
                  <span className="text-white/45">Contacts <span className="text-white/80">{importSummary.contacts}</span></span>
                  <span className="text-white/45">Deals <span className="text-white/80">{importSummary.deals}</span></span>
                  <span className="text-emerald-300/80">Won {importSummary.closed_won}</span>
                  <span className="text-red-300/80">Lost {importSummary.closed_lost}</span>
                  <span className="text-accent">→ {importSummary.events_emitted} fed to ICP</span>
                </div>
              )}
            </Card>
          </ConnectorGroup>

          <ConnectorGroup title="Data providers" caption="Bring your own key, or use ours metered (Engines 02 · 03 · 06)">
            {DATA_PROVIDERS.map((p) => (
              <KeyCard key={p.slug} provider={p} configured={configured.includes(p.slug)} onSave={saveKey} onRemove={removeKey} />
            ))}
          </ConnectorGroup>

          <ConnectorGroup title="Research & signals" caption="Web research powering 3rd-party intent (Engines 03 · 07)">
            {RESEARCH_PROVIDERS.map((p) => (
              <KeyCard key={p.slug} provider={p} configured={configured.includes(p.slug)} onSave={saveKey} onRemove={removeKey} />
            ))}
          </ConnectorGroup>

          <ConnectorGroup title="Delivery" caption="Where plays go out (Engine 09)">
            {DELIVERY_PROVIDERS.filter((p) => p.slug !== 'telegram').map((p) => (
              <KeyCard key={p.slug} provider={p} configured={configured.includes(p.slug)} onSave={saveKey} onRemove={removeKey} />
            ))}
            <TelegramCard
              configured={configured.includes('telegram')}
              onSave={saveKey}
              onRemove={removeKey}
              onTest={async () => {
                setError(null);
                const r = await sendTelegramTest();
                if (!r.ok) setError(r.error?.message ?? 'Test alert failed.');
                return r.ok;
              }}
            />
          </ConnectorGroup>

          <p className="text-[11px] text-white/30">Keys are encrypted at rest (AES-256-GCM) and never shown again after saving.</p>
        </div>
      )}

      {/* Sync Log */}
      {tab === 'log' && (
        <Card className="overflow-hidden p-0">
          <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
            <h2 className="text-sm font-medium text-white/85">CRM Sync Log</h2>
            {failedCount > 0 && (
              <button
                onClick={() => setFailedOnly((v) => !v)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${failedOnly ? 'border-red-400/40 bg-red-500/15 text-red-200' : 'border-white/15 text-white/55 hover:text-white'}`}
              >
                {failedOnly ? `Showing failed (${failedCount})` : `Failed only (${failedCount})`}
              </button>
            )}
          </div>
          {filteredLog.length === 0 ? (
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
                {pg.pageItems.map((r) => (
                  <tr key={r.id} className="border-b border-white/10 last:border-0 hover:bg-white/5">
                    <td className="px-4 py-2.5">
                      <p className="text-white/80">{r.record_type}</p>
                      <p className="font-mono text-xs text-white/35">{r.record_id.slice(0, 16)}…</p>
                    </td>
                    <td className="px-4 py-2.5 text-white/60">{r.operation}</td>
                    <td className="px-4 py-2.5">
                      <Pill tone={OUTCOME_TONE[r.outcome] ?? 'gray'}>{r.outcome}</Pill>
                      {r.outcome !== 'success' && <p className="mt-1 max-w-[28rem] text-xs text-red-300/70">{syncErrorText(r.detail)}</p>}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-white/40">{new Date(r.synced_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <Pagination {...pg} unit="writes" />
        </Card>
      )}

      {/* API */}
      {tab === 'api' && (
        <Card className="space-y-4">
          <h2 className="text-sm font-medium text-white/85">REST API</h2>
          <p className="text-sm text-white/55">Every engine is reachable under the versioned REST API. Calls are authenticated by your session; programmatic API keys are on the roadmap.</p>
          <div className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 font-mono text-xs text-emerald-200">Base URL · <span className="text-white/80">/api/v1</span></div>
          <ul className="space-y-1 text-[13px] text-white/60">
            <li><code className="text-white/80">GET /api/v1/pipeline/status</code> — live status of all 11 engines</li>
            <li><code className="text-white/80">GET /api/v1/tal</code> — current target account list</li>
            <li><code className="text-white/80">GET /api/v1/awareness/feed</code> — hot accounts</li>
            <li><code className="text-white/80">POST /api/v1/plays/fire</code> — fire a play</li>
          </ul>
        </Card>
      )}

      {/* MCP */}
      {tab === 'mcp' && (
        <Card className="space-y-4">
          <h2 className="text-sm font-medium text-white/85">MCP (Model Context Protocol)</h2>
          <p className="text-sm text-white/55">Drive the engines from AI agents (Claude, Cursor, ChatGPT) over MCP — same data, agent surface. Point your MCP client at the workspace and it can read accounts, signals, and fire plays.</p>
          <div className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 font-mono text-xs text-white/70">mcp · <span className="text-accent">abm-engine</span> (configure in your agent)</div>
          <p className="text-[11px] text-white/30">MCP server packaging is in progress — the REST API above backs it today.</p>
        </Card>
      )}

      {tab === 'connectors' && (
        <WhatsNext auto="Connected sources feed the whole pipeline automatically — enrichment, signals, and CRM sync." cta={{ label: 'Define your ICP', href: '/icp' }} />
      )}
    </div>
  );
}

function ConnectorGroup({ title, caption, children }: { title: string; caption: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex items-baseline gap-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/45">{title}</h2>
        <span className="text-[12px] text-white/30">{caption}</span>
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function KeyCard({
  provider,
  configured,
  onSave,
  onRemove,
}: {
  provider: { slug: string; name: string; desc: string };
  configured: boolean;
  onSave: (slug: string, key: string) => Promise<void>;
  onRemove: (slug: string) => Promise<void>;
}) {
  const [key, setKey] = useState('');
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (key.trim().length < 8) return;
    setBusy(true);
    await onSave(provider.slug, key.trim());
    setKey(''); setEditing(false); setBusy(false);
  };
  const remove = async () => { setBusy(true); await onRemove(provider.slug); setBusy(false); };

  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="flex items-center gap-2 font-medium text-white/90">
            {provider.name}
            {configured && <Pill tone="green">connected</Pill>}
          </p>
          <p className="text-xs text-white/45">{provider.desc}</p>
        </div>
        {configured && !editing ? (
          <div className="flex items-center gap-3">
            <button onClick={() => setEditing(true)} className="text-xs text-white/50 hover:text-white">Replace</button>
            <button onClick={remove} disabled={busy} className="text-xs text-red-300/70 hover:text-red-300">Remove</button>
          </div>
        ) : null}
      </div>

      {(!configured || editing) && (
        <div className="flex items-center gap-2">
          <input
            type="password"
            value={key}
            placeholder={`Enter your ${provider.name} API key`}
            onChange={(e) => setKey(e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white/85 placeholder:text-white/30 outline-none focus:border-accent/40"
          />
          <button
            onClick={save}
            disabled={busy || key.trim().length < 8}
            className="shrink-0 rounded-lg bg-accent px-3.5 py-2 text-[13px] font-semibold text-accent-foreground transition hover:bg-accent-hover disabled:bg-white/10 disabled:text-white/30"
          >
            {busy ? '…' : 'Save'}
          </button>
          {editing && <button onClick={() => { setEditing(false); setKey(''); }} className="shrink-0 text-xs text-white/40 hover:text-white">Cancel</button>}
        </div>
      )}
    </Card>
  );
}

/**
 * Telegram needs two values (bot token + chat id) that we store joined as
 * "token;chatId". Two labelled inputs are far friendlier than asking the user to
 * format the separator by hand.
 */
function TelegramCard({
  configured,
  onSave,
  onRemove,
  onTest,
}: {
  configured: boolean;
  onSave: (slug: string, key: string) => Promise<void>;
  onRemove: (slug: string) => Promise<void>;
  onTest: () => Promise<boolean>;
}) {
  const [token, setToken] = useState('');
  const [chatId, setChatId] = useState('');
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tested, setTested] = useState(false);

  const valid = token.trim().length >= 20 && token.includes(':') && /^-?\d+$/.test(chatId.trim());

  const save = async () => {
    if (!valid) return;
    setBusy(true);
    await onSave('telegram', `${token.trim()};${chatId.trim()}`);
    setToken(''); setChatId(''); setEditing(false); setBusy(false);
  };
  const remove = async () => { setBusy(true); await onRemove('telegram'); setBusy(false); };
  const test = async () => { setBusy(true); const okRes = await onTest(); setTested(okRes); setBusy(false); if (okRes) setTimeout(() => setTested(false), 2500); };

  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="flex items-center gap-2 font-medium text-white/90">
            Telegram
            {configured && <Pill tone="green">connected</Pill>}
          </p>
          <p className="text-xs text-white/45">Bot alerts when a play fires — hot accounts, demos, new leads (Engine 09).</p>
        </div>
        {configured && !editing ? (
          <div className="flex items-center gap-3">
            <button onClick={() => setEditing(true)} className="text-xs text-white/50 hover:text-white">Replace</button>
            <button onClick={remove} disabled={busy} className="text-xs text-red-300/70 hover:text-red-300">Remove</button>
          </div>
        ) : null}
      </div>

      {(!configured || editing) && (
        <div className="space-y-2.5">
          <div className="space-y-1">
            <label className="text-[11px] font-medium uppercase tracking-wide text-white/40">Bot token</label>
            <input
              type="password"
              value={token}
              placeholder="123456789:AAH9xQ…  (from @BotFather)"
              onChange={(e) => setToken(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white/85 placeholder:text-white/30 outline-none focus:border-accent/40"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[11px] font-medium uppercase tracking-wide text-white/40">Chat ID</label>
            <input
              value={chatId}
              placeholder="642318997  (from @userinfobot)"
              onChange={(e) => setChatId(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white/85 placeholder:text-white/30 outline-none focus:border-accent/40"
            />
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={save}
              disabled={busy || !valid}
              className="rounded-lg bg-accent px-3.5 py-2 text-[13px] font-semibold text-accent-foreground transition hover:bg-accent-hover disabled:bg-white/10 disabled:text-white/30"
            >
              {busy ? '…' : 'Save'}
            </button>
            {editing && <button onClick={() => { setEditing(false); setToken(''); setChatId(''); }} className="text-xs text-white/40 hover:text-white">Cancel</button>}
            <span className="text-[11px] text-white/30">Message your bot once first, or it can&apos;t reply.</span>
          </div>
        </div>
      )}

      {configured && !editing && (
        <div className="flex items-center gap-3 border-t border-white/[0.06] pt-3">
          <button onClick={test} disabled={busy} className="rounded-lg border border-accent/40 bg-accent/10 px-3.5 py-2 text-[13px] font-medium text-accent transition hover:bg-accent/20 disabled:opacity-40">
            {busy ? 'Sending…' : 'Send test alert'}
          </button>
          {tested && <span className="text-[12px] text-emerald-300">Sent ✓ check Telegram</span>}
        </div>
      )}
    </Card>
  );
}
