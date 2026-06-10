'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { apiFetch, getDevOrgId } from '@/lib/api-client';

type Account = {
  id: string;
  domain: string;
  name: string | null;
  externalCrmId: string | null;
  externalCrmProvider: string | null;
  industry: string | null;
  employees: string | null;
  country: string | null;
  website: string | null;
  enrichedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type AccountsResponse = { count: number; accounts: Account[] };

function useAccounts() {
  return useQuery<AccountsResponse>({
    queryKey: ['accounts'],
    queryFn: () => apiFetch<AccountsResponse>('/api/accounts'),
  });
}

function useSyncFromHubspot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const orgId = getDevOrgId();
      const job = await apiFetch<{ jobId: string }>('/api/dev/sync/accounts', {
        method: 'POST',
        body: JSON.stringify({ orgId }),
      });
      // Poll until the job finishes (or 30s deadline). Cheap because BullMQ
      // job state is in Redis and we read it through a dev endpoint.
      const deadline = Date.now() + 30_000;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 1_500));
        const status = await apiFetch<{
          state?: string;
          returnvalue?: unknown;
          failedReason?: string;
        }>(`/api/dev/sync/jobs/${encodeURIComponent(job.jobId)}`);
        if (status.state === 'completed' || status.state === 'failed') {
          return status;
        }
      }
      return { state: 'timeout' };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['accounts'] });
    },
  });
}

export default function AccountsPage() {
  const accounts = useAccounts();
  const sync = useSyncFromHubspot();
  const [search, setSearch] = useState('');

  const rows = accounts.data?.accounts ?? [];
  const filtered = search
    ? rows.filter(
        (a) =>
          a.domain.toLowerCase().includes(search.toLowerCase()) ||
          (a.name ?? '').toLowerCase().includes(search.toLowerCase()),
      )
    : rows;

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-8 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Accounts</h1>
          <p className="mt-1 text-sm text-neutral-500">
            {accounts.isLoading
              ? 'Loading…'
              : `${accounts.data?.count ?? 0} accounts in your CRM-synced list.`}
          </p>
        </div>
        <button
          onClick={() => sync.mutate()}
          disabled={sync.isPending}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
        >
          {sync.isPending ? 'Syncing…' : 'Sync from HubSpot'}
        </button>
      </header>

      {sync.isError && (
        <div className="mb-4 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          Sync failed: {(sync.error as Error)?.message}
        </div>
      )}
      {sync.isSuccess && (
        <div className="mb-4 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
          Sync {String((sync.data as { state?: string })?.state ?? 'done')}.
        </div>
      )}

      <input
        type="search"
        placeholder="Filter by domain or name…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="mb-4 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-neutral-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-900"
      />

      {accounts.isError && (
        <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {(accounts.error as Error).message}
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-800">
        <table className="min-w-full divide-y divide-neutral-200 dark:divide-neutral-800">
          <thead className="bg-neutral-50 dark:bg-neutral-900">
            <tr>
              {['Domain', 'Name', 'Industry', 'Employees', 'Country', 'CRM'].map((h) => (
                <th
                  key={h}
                  className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-neutral-500"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200 bg-white dark:divide-neutral-800 dark:bg-neutral-950">
            {filtered.length === 0 && !accounts.isLoading && (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-12 text-center text-sm text-neutral-500"
                >
                  No accounts. Click <strong>Sync from HubSpot</strong> to pull them in.
                </td>
              </tr>
            )}
            {filtered.map((a) => (
              <tr key={a.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-900">
                <td className="whitespace-nowrap px-4 py-3 text-sm font-medium">{a.domain}</td>
                <td className="whitespace-nowrap px-4 py-3 text-sm">{a.name ?? '—'}</td>
                <td className="whitespace-nowrap px-4 py-3 text-sm text-neutral-500">
                  {a.industry ?? '—'}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-sm text-neutral-500">
                  {a.employees ?? '—'}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-sm text-neutral-500">
                  {a.country ?? '—'}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-xs uppercase text-neutral-500">
                  {a.externalCrmProvider ?? '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
