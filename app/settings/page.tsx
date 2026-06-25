'use client';

/**
 * /settings — the workspace settings hub. Org identity (editable, persists),
 * AI provider status, quick links to the config that lives inside engines, and
 * account sign-out.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card, Banner } from '@/app/icp/ui';
import { me, getWorkspace, updateWorkspace, logout, getLlmConfig, updateLlmConfig, testLlmConfig, type LlmConfig } from '@/lib/web/auth-api';

const QUICK_LINKS = [
  { label: 'Ideal Customer Profile', sub: 'Edit your ICP + targeting', href: '/icp' },
  { label: 'Scoring rubric', sub: 'Criteria, weights, tier boundaries', href: '/scoring' },
  { label: 'Routing rules', sub: 'When plays fire on hot accounts', href: '/awareness' },
  { label: 'Connectors', sub: 'CRM, data + delivery keys', href: '/integrations' },
];

export default function SettingsPage() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [wsId, setWsId] = useState('');
  const [name, setName] = useState('');
  const [original, setOriginal] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // LLM (Ollama) runtime config
  const [llm, setLlm] = useState<LlmConfig | null>(null);
  const [oUrl, setOUrl] = useState('');
  const [oModel, setOModel] = useState('');
  const [oAuth, setOAuth] = useState('');
  const [llmBusy, setLlmBusy] = useState(false);
  const [llmMsg, setLlmMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const [m, w, l] = await Promise.all([me(), getWorkspace(), getLlmConfig()]);
      if (m.ok && m.data) { setEmail(m.data.email); setWsId(m.data.workspace_id); }
      if (w.ok && w.data) { setName(w.data.name); setOriginal(w.data.name); }
      if (l.ok && l.data) { setLlm(l.data); setOUrl(l.data.url); setOModel(l.data.model); }
      setLoading(false);
    })();
  }, []);

  const saveLlm = async () => {
    setLlmBusy(true); setLlmMsg(null);
    const r = await updateLlmConfig({ url: oUrl.trim(), model: oModel.trim(), ...(oAuth ? { auth: oAuth.trim() } : {}) });
    if (r.ok && r.data) { setLlm(r.data); setOAuth(''); setLlmMsg('Saved — takes effect immediately.'); }
    else setLlmMsg(r.error?.message ?? 'Could not save.');
    setLlmBusy(false);
  };

  const testLlm = async () => {
    setLlmBusy(true); setLlmMsg(null);
    const r = await testLlmConfig({ url: oUrl.trim(), ...(oAuth ? { auth: oAuth.trim() } : {}) });
    if (r.ok && r.data) setLlmMsg(`Reachable ✓ ${r.data.models.length ? 'Models: ' + r.data.models.slice(0, 4).join(', ') : '(no models listed)'}`);
    else setLlmMsg(r.error?.message ?? 'Endpoint unreachable.');
    setLlmBusy(false);
  };

  const save = async () => {
    setSaving(true); setError(null); setSaved(false);
    const r = await updateWorkspace(name.trim());
    if (r.ok && r.data) { setOriginal(r.data.name); setSaved(true); setTimeout(() => setSaved(false), 2000); }
    else setError(r.error?.message ?? 'Could not save.');
    setSaving(false);
  };

  if (loading) return <p className="text-sm text-white/40">Loading settings…</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-medium text-white">Settings</h1>
        <p className="mt-1 text-sm text-white/55">Your workspace identity, AI provider, and where to configure each engine.</p>
      </div>

      {error && <Banner tone="red">{error}</Banner>}
      {saved && <Banner tone="blue">Workspace saved.</Banner>}

      {/* Org identity */}
      <Card className="space-y-4">
        <h2 className="text-sm font-medium text-white/85">Workspace</h2>
        <div className="space-y-1.5">
          <label className="text-xs font-medium uppercase tracking-wider text-white/45">Name</label>
          <div className="flex items-center gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full max-w-sm rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5 text-sm text-white outline-none transition focus:border-accent/40"
            />
            <button
              onClick={save}
              disabled={saving || name.trim() === original || name.trim().length < 2}
              className="rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground transition hover:bg-accent-hover disabled:bg-white/10 disabled:text-white/30"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
        <div className="flex flex-wrap gap-x-8 gap-y-2 border-t border-white/[0.06] pt-4 text-[13px]">
          <div><span className="text-white/40">Signed in as</span> <span className="text-white/80">{email}</span></div>
          <div><span className="text-white/40">Workspace ID</span> <span className="font-mono text-white/70">{wsId.slice(0, 14)}…</span></div>
        </div>
      </Card>

      {/* AI provider — editable Ollama endpoint (for a rotating tunnel URL) */}
      <Card className="space-y-4">
        <div>
          <h2 className="text-sm font-medium text-white/85">AI provider — Ollama endpoint</h2>
          <p className="mt-1 text-sm text-white/55">
            All AI (ICP synthesis, intake, scoring, play drafts) runs through your local Ollama. Hosting it behind a tunnel
            whose URL changes on restart? Paste the new URL here — it takes effect immediately, no redeploy.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1 sm:col-span-2">
            <label className="text-[11px] font-medium uppercase tracking-wide text-white/40">Endpoint URL {llm && <span className="ml-1 text-white/30">(source: {llm.source})</span>}</label>
            <input value={oUrl} onChange={(e) => setOUrl(e.target.value)} placeholder="https://your-tunnel.trycloudflare.com"
              className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white/85 placeholder:text-white/30 outline-none focus:border-accent/40" />
          </div>
          <div className="space-y-1">
            <label className="text-[11px] font-medium uppercase tracking-wide text-white/40">Model</label>
            <input value={oModel} onChange={(e) => setOModel(e.target.value)} placeholder="qwen2.5:3b"
              className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white/85 placeholder:text-white/30 outline-none focus:border-accent/40" />
          </div>
          <div className="space-y-1">
            <label className="text-[11px] font-medium uppercase tracking-wide text-white/40">Auth header {llm?.has_auth && <span className="text-emerald-300/70">· set</span>} <span className="text-white/25">(optional)</span></label>
            <input type="password" value={oAuth} onChange={(e) => setOAuth(e.target.value)} placeholder="Bearer … (leave blank to keep)"
              className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white/85 placeholder:text-white/30 outline-none focus:border-accent/40" />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button onClick={saveLlm} disabled={llmBusy} className="rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-accent-foreground transition hover:bg-accent-hover disabled:bg-white/10 disabled:text-white/30">
            {llmBusy ? '…' : 'Save'}
          </button>
          <button onClick={testLlm} disabled={llmBusy} className="rounded-lg border border-accent/40 bg-accent/10 px-4 py-2 text-[13px] font-medium text-accent transition hover:bg-accent/20 disabled:opacity-40">
            Test connection
          </button>
          {llmMsg && <span className="text-[12px] text-white/60">{llmMsg}</span>}
        </div>
        <p className="text-[11px] text-white/30">Secure the tunnel (Cloudflare Access / basic-auth) and put its credential in the Auth header — otherwise your Ollama is open to the internet.</p>
      </Card>

      {/* Quick links */}
      <Card className="space-y-3">
        <h2 className="text-sm font-medium text-white/85">Configure your engines</h2>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {QUICK_LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="group flex items-center justify-between rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-3 transition hover:border-accent/30 hover:bg-white/[0.04]">
              <div>
                <p className="text-[13.5px] font-medium text-white/85">{l.label}</p>
                <p className="text-[11.5px] text-white/40">{l.sub}</p>
              </div>
              <span className="text-white/30 transition group-hover:text-accent">→</span>
            </Link>
          ))}
        </div>
      </Card>

      {/* Account */}
      <Card className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-white/85">Sign out</p>
          <p className="text-xs text-white/45">End your session on this device.</p>
        </div>
        <button
          onClick={async () => { await logout(); router.push('/login'); router.refresh(); }}
          className="rounded-xl border border-white/15 bg-white/[0.04] px-4 py-2 text-sm font-medium text-white/75 transition hover:border-white/25 hover:text-white"
        >
          Log out
        </button>
      </Card>
    </div>
  );
}
