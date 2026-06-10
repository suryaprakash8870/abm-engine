'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';

type Settings = {
  org: { id: string; name: string; slug: string; slackWebhookConfigured: boolean };
  crm: { provider: string; connected: boolean; mode: string };
  recurringSync: { enabled: boolean; everyMinutes: number | null; next: number | null };
  enrichment: { provider: string };
};

type UpdateSettingsBody = { name?: string; slackWebhookUrl?: string };
type RecurringSyncBody = { enabled: boolean; everyMinutes?: number };

function useSettings() {
  return useQuery<Settings>({
    queryKey: ['settings'],
    queryFn: () => apiFetch<Settings>('/api/settings'),
  });
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-neutral-200 p-5 dark:border-neutral-800">
      <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-neutral-500">
        {title}
      </h2>
      {children}
    </section>
  );
}

function StatusPill({ ok, yes, no }: { ok: boolean; yes: string; no: string }) {
  return ok ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
      ✓ {yes}
    </span>
  ) : (
    <span className="inline-flex items-center rounded-full bg-neutral-200 px-2 py-0.5 text-xs font-medium text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
      {no}
    </span>
  );
}

const inputClass =
  'w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-neutral-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-900';
const primaryBtn =
  'rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200';
const secondaryBtn =
  'rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 shadow-sm hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-900';

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const settings = useSettings();

  const [orgName, setOrgName] = useState('');
  const [slackUrl, setSlackUrl] = useState('');
  const [slackError, setSlackError] = useState<string | null>(null);
  const [minutes, setMinutes] = useState('60');
  const [formReady, setFormReady] = useState(false);

  // Initialize editable fields once the settings load (don't clobber edits on refetch).
  useEffect(() => {
    if (settings.data && !formReady) {
      setOrgName(settings.data.org.name);
      if (settings.data.recurringSync.everyMinutes) {
        setMinutes(String(settings.data.recurringSync.everyMinutes));
      }
      setFormReady(true);
    }
  }, [settings.data, formReady]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['settings'] });
  };

  const saveName = useMutation<unknown, Error, UpdateSettingsBody>({
    mutationFn: (body) =>
      apiFetch('/api/settings', { method: 'PUT', body: JSON.stringify(body) }),
    onSuccess: invalidate,
  });

  const saveSlack = useMutation<unknown, Error, UpdateSettingsBody>({
    mutationFn: (body) =>
      apiFetch('/api/settings', { method: 'PUT', body: JSON.stringify(body) }),
    onSuccess: () => {
      setSlackUrl('');
      invalidate();
    },
  });

  const recurringSync = useMutation<unknown, Error, RecurringSyncBody>({
    mutationFn: (body) =>
      apiFetch('/api/settings/recurring-sync', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: invalidate,
  });

  function handleSlackSave() {
    setSlackError(null);
    if (!slackUrl.startsWith('https://hooks.slack.com/')) {
      setSlackError('Webhook URL must start with https://hooks.slack.com/');
      return;
    }
    saveSlack.mutate({ slackWebhookUrl: slackUrl });
  }

  const data = settings.data;
  const sync = data?.recurringSync;

  return (
    <main className="mx-auto max-w-7xl px-6 py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-neutral-500">
          {settings.isLoading
            ? 'Loading…'
            : data
              ? `${data.org.name} · ${data.org.slug}`
              : ''}
        </p>
      </header>

      {settings.isError && (
        <div className="mb-6 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {settings.error.message}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Organization */}
        <Card title="Organization">
          <label className="mb-1 block text-xs font-medium text-neutral-700 dark:text-neutral-300">
            Name
          </label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              disabled={settings.isLoading}
              className={inputClass}
            />
            <button
              onClick={() => saveName.mutate({ name: orgName })}
              disabled={saveName.isPending || !orgName.trim() || settings.isLoading}
              className={primaryBtn}
            >
              {saveName.isPending ? 'Saving…' : 'Save'}
            </button>
          </div>
          {saveName.isError && (
            <p className="mt-2 text-xs text-red-600 dark:text-red-400">
              {saveName.error.message}
            </p>
          )}
          {saveName.isSuccess && (
            <p className="mt-2 text-xs text-emerald-600 dark:text-emerald-400">Saved.</p>
          )}
        </Card>

        {/* Slack alerts */}
        <Card title="Slack alerts">
          <div className="mb-3">
            <StatusPill
              ok={data?.org.slackWebhookConfigured ?? false}
              yes="Webhook configured"
              no="Not configured"
            />
          </div>
          <label className="mb-1 block text-xs font-medium text-neutral-700 dark:text-neutral-300">
            Incoming webhook URL
          </label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={slackUrl}
              onChange={(e) => {
                setSlackUrl(e.target.value);
                setSlackError(null);
              }}
              placeholder="https://hooks.slack.com/services/…"
              className={inputClass}
            />
            <button
              onClick={handleSlackSave}
              disabled={saveSlack.isPending || !slackUrl.trim()}
              className={primaryBtn}
            >
              {saveSlack.isPending ? 'Saving…' : 'Save'}
            </button>
          </div>
          {slackError && (
            <p className="mt-2 text-xs text-red-600 dark:text-red-400">{slackError}</p>
          )}
          {saveSlack.isError && (
            <p className="mt-2 text-xs text-red-600 dark:text-red-400">
              {saveSlack.error.message}
            </p>
          )}
          {saveSlack.isSuccess && (
            <p className="mt-2 text-xs text-emerald-600 dark:text-emerald-400">
              Webhook saved.
            </p>
          )}
          <p className="mt-3 text-xs text-neutral-500">
            Used by orchestrator rules (Phase 3) to alert you when a hot account fires a signal.
          </p>
        </Card>

        {/* CRM connection */}
        <Card title="CRM connection">
          {data ? (
            <dl className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <dt className="text-neutral-500">Provider</dt>
                <dd className="font-medium uppercase">{data.crm.provider}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-neutral-500">Mode</dt>
                <dd className="font-medium">{data.crm.mode}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-neutral-500">Status</dt>
                <dd>
                  <StatusPill ok={data.crm.connected} yes="Connected" no="Not connected" />
                </dd>
              </div>
            </dl>
          ) : (
            <p className="text-sm text-neutral-500">Loading…</p>
          )}
        </Card>

        {/* Recurring sync */}
        <Card title="Recurring sync">
          <div className="mb-3 text-sm">
            {sync?.enabled ? (
              <span className="text-emerald-700 dark:text-emerald-400">
                Enabled — every {sync.everyMinutes} min
                {sync.next ? ` · next run ${new Date(sync.next).toLocaleTimeString()}` : ''}
              </span>
            ) : (
              <span className="text-neutral-500">Disabled</span>
            )}
          </div>
          <label className="mb-1 block text-xs font-medium text-neutral-700 dark:text-neutral-300">
            Interval (minutes, min 5)
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={5}
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
              className={`${inputClass} max-w-[8rem]`}
            />
            <button
              onClick={() =>
                recurringSync.mutate({
                  enabled: true,
                  everyMinutes: Math.max(5, Number(minutes) || 60),
                })
              }
              disabled={recurringSync.isPending}
              className={primaryBtn}
            >
              {recurringSync.isPending ? 'Working…' : 'Enable'}
            </button>
            <button
              onClick={() => recurringSync.mutate({ enabled: false })}
              disabled={recurringSync.isPending || !sync?.enabled}
              className={secondaryBtn}
            >
              Disable
            </button>
          </div>
          {recurringSync.isError && (
            <p className="mt-2 text-xs text-red-600 dark:text-red-400">
              {recurringSync.error.message}
            </p>
          )}
          <p className="mt-3 text-xs text-neutral-500">
            Pulls accounts from your CRM on a schedule and re-scores them — keeps fit scores fresh
            without manual syncs.
          </p>
        </Card>

        {/* Enrichment */}
        <Card title="Enrichment">
          <p className="text-sm">
            <span className="text-neutral-500">Provider: </span>
            <span className="font-medium">
              {data ? data.enrichment.provider : '…'}
            </span>
          </p>
          <p className="mt-3 text-xs text-neutral-500">
            Read-only — set APOLLO_API_KEY on the API to switch from the mock provider to live
            Apollo enrichment.
          </p>
        </Card>
      </div>
    </main>
  );
}
