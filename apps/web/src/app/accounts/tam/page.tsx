'use client';

import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import { getSupabase } from '@/lib/supabase';

type TamAccount = {
  id: string;
  domain: string;
  name: string | null;
  industry: string | null;
  employees: string | null;
  country: string | null;
  fitScore: number | null;
  tier: 1 | 2 | 3 | null;
  createdAt: string;
};

type TamResponse = { count: number; accounts: TamAccount[] };

type SearchBody = {
  industry?: string;
  employeesMin?: number;
  employeesMax?: number;
  country?: string;
  limit?: number;
};

type SearchResult = { found: number; imported: number; skippedExisting: number };

function useTamAccounts() {
  return useQuery<TamResponse>({
    queryKey: ['tam'],
    queryFn: () => apiFetch<TamResponse>('/api/tam'),
  });
}

function TierBadge({ tier }: { tier: TamAccount['tier'] }) {
  if (tier === 1)
    return (
      <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
        Tier 1
      </span>
    );
  if (tier === 2)
    return (
      <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300">
        Tier 2
      </span>
    );
  if (tier === 3)
    return (
      <span className="inline-flex items-center rounded-full bg-neutral-200 px-2 py-0.5 text-xs font-medium text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
        Tier 3
      </span>
    );
  return <span className="text-neutral-500">—</span>;
}

/** Pull the server's own message out of an apiFetch error ("503 Service Unavailable — {json}"). */
function serverMessage(err: Error): string {
  const idx = err.message.indexOf(' — ');
  const raw = idx >= 0 ? err.message.slice(idx + 3) : err.message;
  try {
    const parsed = JSON.parse(raw) as { message?: string | string[] };
    if (parsed.message) {
      return Array.isArray(parsed.message) ? parsed.message.join('; ') : parsed.message;
    }
  } catch {
    // body wasn't JSON — show it as-is
  }
  return raw || err.message;
}

const inputClass =
  'w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-neutral-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-900';

export default function TamPage() {
  const queryClient = useQueryClient();
  const tam = useTamAccounts();

  const [industry, setIndustry] = useState('');
  const [country, setCountry] = useState('');
  const [employeesMin, setEmployeesMin] = useState('');
  const [employeesMax, setEmployeesMax] = useState('');
  const [limit, setLimit] = useState('25');

  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const search = useMutation<SearchResult, Error, SearchBody>({
    mutationFn: (body) =>
      apiFetch<SearchResult>('/api/tam/search', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tam'] });
    },
  });

  function handleSearch(e: FormEvent) {
    e.preventDefault();
    const body: SearchBody = { limit: Math.max(1, Number(limit) || 25) };
    if (industry.trim()) body.industry = industry.trim();
    if (country.trim()) body.country = country.trim();
    if (employeesMin.trim()) body.employeesMin = Number(employeesMin);
    if (employeesMax.trim()) body.employeesMax = Number(employeesMax);
    search.mutate(body);
  }

  /**
   * Raw fetch (not apiFetch — the endpoint returns text/csv, not JSON).
   * Builds auth headers the same way apiFetch does, then triggers a download.
   */
  async function downloadAudienceCsv() {
    setDownloading(true);
    setDownloadError(null);
    try {
      const headers: Record<string, string> = {};
      const supabase = getSupabase();
      const token = supabase
        ? (await supabase.auth.getSession()).data.session?.access_token
        : undefined;
      if (token) {
        headers.authorization = `Bearer ${token}`;
      } else {
        headers['x-org-id'] = process.env.NEXT_PUBLIC_DEV_ORG_ID ?? '';
      }

      const base = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000';
      const res = await fetch(`${base}/api/audiences/tiers.csv?tiers=1,2`, { headers });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`${res.status} ${res.statusText} — ${body.slice(0, 200)}`);
      }
      const csv = await res.text();

      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'abm-audience-tiers.csv';
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setDownloadError((e as Error).message);
    } finally {
      setDownloading(false);
    }
  }

  const rows = tam.data?.accounts ?? [];
  const isKeyGated = search.isError && search.error.message.startsWith('503');

  return (
    <main className="mx-auto max-w-7xl px-6 py-10">
      <header className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">TAM Prospects</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Accounts sourced beyond your CRM (Playbook Step 3).
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <button
            onClick={downloadAudienceCsv}
            disabled={downloading}
            title="Exports all Tier 1 + Tier 2 accounts as a CSV for LinkedIn/HubSpot ad audiences"
            className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 shadow-sm hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-900"
          >
            {downloading ? 'Preparing…' : '↓ Download audience CSV (Tier 1+2)'}
          </button>
          {downloadError && (
            <p className="text-xs text-red-600 dark:text-red-400">{downloadError}</p>
          )}
        </div>
      </header>

      {/* Search & import form */}
      <form
        onSubmit={handleSearch}
        className="mb-6 rounded-lg border border-neutral-200 p-5 dark:border-neutral-800"
      >
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-neutral-500">
          Search Apollo &amp; import
        </h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-700 dark:text-neutral-300">
              Industry
            </label>
            <input
              type="text"
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              placeholder="e.g. Software"
              className={inputClass}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-700 dark:text-neutral-300">
              Country
            </label>
            <input
              type="text"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              placeholder="e.g. United States"
              className={inputClass}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-700 dark:text-neutral-300">
              Employees min
            </label>
            <input
              type="number"
              min={1}
              value={employeesMin}
              onChange={(e) => setEmployeesMin(e.target.value)}
              placeholder="50"
              className={inputClass}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-700 dark:text-neutral-300">
              Employees max
            </label>
            <input
              type="number"
              min={1}
              value={employeesMax}
              onChange={(e) => setEmployeesMax(e.target.value)}
              placeholder="1000"
              className={inputClass}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-700 dark:text-neutral-300">
              Limit
            </label>
            <input
              type="number"
              min={1}
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>
        <div className="mt-4">
          <button
            type="submit"
            disabled={search.isPending}
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
          >
            {search.isPending ? 'Searching…' : 'Search & import'}
          </button>
        </div>
      </form>

      {search.isSuccess && (
        <div className="mb-4 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
          Found {search.data.found} · imported {search.data.imported} new · skipped{' '}
          {search.data.skippedExisting} already present.
        </div>
      )}

      {isKeyGated && (
        <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          {serverMessage(search.error)}
        </div>
      )}

      {search.isError && !isKeyGated && (
        <div className="mb-4 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          Search failed: {serverMessage(search.error)}
        </div>
      )}

      {tam.isError && (
        <div className="mb-4 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {tam.error.message}
        </div>
      )}

      <p className="mb-2 text-xs text-neutral-500">
        {tam.isLoading ? 'Loading…' : `${tam.data?.count ?? 0} TAM prospects`}
      </p>

      <div className="overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-800">
        <table className="min-w-full divide-y divide-neutral-200 dark:divide-neutral-800">
          <thead className="bg-neutral-50 dark:bg-neutral-900">
            <tr>
              {['Domain', 'Name', 'Industry', 'Employees', 'Country', 'Fit', 'Tier'].map((h) => (
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
            {rows.length === 0 && !tam.isLoading && (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-sm text-neutral-500">
                  No TAM prospects yet. Use <strong>Search &amp; import</strong> above to source
                  accounts beyond your CRM.
                </td>
              </tr>
            )}
            {rows.map((a) => (
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
                <td className="whitespace-nowrap px-4 py-3 text-sm font-semibold tabular-nums">
                  {a.fitScore === null ? <span className="text-neutral-500">—</span> : a.fitScore}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-sm">
                  <TierBadge tier={a.tier} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
