'use client';

import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { apiFetch } from '@/lib/api-client';

type Breakdown = {
  field: string;
  value: string | number | null;
  points: number;
  reason: string;
};

type AccountDetail = {
  account: {
    id: string;
    domain: string;
    name: string | null;
    externalCrmId: string | null;
    externalCrmProvider: string | null;
    industry: string | null;
    employees: string | null;
    country: string | null;
    website: string | null;
    enrichment: Record<string, unknown> | null;
    enrichedAt: string | null;
    createdAt: string;
    updatedAt: string;
  };
  score: {
    fitScore: number | null;
    tier: 1 | 2 | 3 | null;
    computedAt: string | null;
  };
  breakdown: Breakdown[] | null;
  liveFitScore: number | null;
  liveTier: 1 | 2 | 3 | null;
};

const FIELD_LABELS: Record<string, string> = {
  industry: 'Industry',
  employees: 'Employees',
  country: 'Country',
  crmProvider: 'CRM in use',
  hasWebsite: 'Real company (has website)',
};

function TierBadge({ tier, big = false }: { tier: AccountDetail['score']['tier']; big?: boolean }) {
  const sizing = big ? 'px-3 py-1 text-sm' : 'px-2 py-0.5 text-xs';
  if (tier === 1)
    return (
      <span
        className={`inline-flex items-center rounded-full bg-emerald-100 font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 ${sizing}`}
      >
        Tier 1
      </span>
    );
  if (tier === 2)
    return (
      <span
        className={`inline-flex items-center rounded-full bg-amber-100 font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300 ${sizing}`}
      >
        Tier 2
      </span>
    );
  if (tier === 3)
    return (
      <span
        className={`inline-flex items-center rounded-full bg-neutral-200 font-medium text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300 ${sizing}`}
      >
        Tier 3
      </span>
    );
  return (
    <span
      className={`inline-flex items-center rounded-full bg-neutral-200 font-medium text-neutral-500 dark:bg-neutral-800 dark:text-neutral-500 ${sizing}`}
    >
      Drop / unscored
    </span>
  );
}

function PointsCell({ points }: { points: number }) {
  if (points === 0)
    return <span className="text-neutral-500">0</span>;
  return (
    <span className="font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
      +{points}
    </span>
  );
}

export default function AccountDetailPage() {
  const { id } = useParams<{ id: string }>();
  const detail = useQuery<AccountDetail>({
    queryKey: ['account', id],
    queryFn: () => apiFetch<AccountDetail>(`/api/accounts/${id}`),
    enabled: Boolean(id),
  });

  if (detail.isLoading) {
    return (
      <main className="mx-auto max-w-4xl px-6 py-10">
        <p className="text-sm text-neutral-500">Loading…</p>
      </main>
    );
  }

  if (detail.isError) {
    return (
      <main className="mx-auto max-w-4xl px-6 py-10">
        <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {(detail.error as Error).message}
        </div>
      </main>
    );
  }

  if (!detail.data) return null;
  const { account, score, breakdown, liveFitScore, liveTier } = detail.data;

  // If the persisted score and the live re-computation disagree, the rubric
  // has changed since the last sync. Surface a "stale" hint.
  const persisted = score.fitScore;
  const live = liveFitScore;
  const stale =
    persisted !== null && live !== null && persisted !== live;

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      {/* ─── Hero ───────────────────────────────────────────────── */}
      <header className="mt-4 flex flex-wrap items-end justify-between gap-6 border-b border-neutral-200 pb-6 dark:border-neutral-800">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{account.name ?? account.domain}</h1>
          <p className="mt-1 text-sm text-neutral-500">
            {account.domain}
            {account.externalCrmProvider && (
              <>
                {' · '}
                <span className="uppercase">{account.externalCrmProvider}</span>
                {account.externalCrmId && (
                  <span className="text-neutral-400"> #{account.externalCrmId}</span>
                )}
              </>
            )}
          </p>
        </div>
        <div className="flex items-end gap-4">
          <div>
            <div className="text-xs uppercase tracking-wider text-neutral-500">Fit score</div>
            <div className="mt-1 text-4xl font-semibold tabular-nums">
              {score.fitScore === null ? '—' : score.fitScore}
            </div>
          </div>
          <div className="pb-1">
            <TierBadge tier={score.tier} big />
          </div>
        </div>
      </header>

      {stale && (
        <div className="mt-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          Score is stale: stored <strong>{persisted}</strong> · current rubric would give{' '}
          <strong>{live}</strong> (Tier {liveTier ?? 'Drop'}). Re-sync to refresh.
        </div>
      )}

      {/* ─── Score breakdown ────────────────────────────────────── */}
      <section className="mt-8">
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-neutral-500">
          How this score was computed
        </h2>

        {!breakdown && (
          <div className="rounded-md border border-neutral-200 bg-neutral-50 px-4 py-6 text-sm text-neutral-600 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-400">
            No active ICP rubric for this org — nothing to explain. Seed one via the migrations.
          </div>
        )}

        {breakdown && (
          <div className="overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-800">
            <table className="min-w-full divide-y divide-neutral-200 dark:divide-neutral-800">
              <thead className="bg-neutral-50 dark:bg-neutral-900">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-neutral-500">
                    Field
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-neutral-500">
                    Value
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-neutral-500">
                    Points
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-neutral-500">
                    Why
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 bg-white dark:divide-neutral-800 dark:bg-neutral-950">
                {breakdown.map((b) => (
                  <tr key={b.field}>
                    <td className="px-4 py-3 text-sm font-medium">
                      {FIELD_LABELS[b.field] ?? b.field}
                    </td>
                    <td className="px-4 py-3 text-sm text-neutral-600 dark:text-neutral-400">
                      {b.value === null || b.value === '' ? (
                        <span className="italic text-neutral-500">missing</span>
                      ) : (
                        String(b.value)
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-sm">
                      <PointsCell points={b.points} />
                    </td>
                    <td className="px-4 py-3 text-sm text-neutral-500">{b.reason}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-neutral-50 dark:bg-neutral-900">
                <tr>
                  <td colSpan={2} className="px-4 py-3 text-right text-xs uppercase tracking-wider text-neutral-500">
                    Total
                  </td>
                  <td className="px-4 py-3 text-right text-base font-semibold tabular-nums">
                    {liveFitScore ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-sm text-neutral-500">
                    Tier{' '}
                    {liveTier !== null && liveTier !== undefined ? liveTier : 'Drop / below cutoff'}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      {/* ─── Raw enrichment (collapsed details) ──────────────────── */}
      <section className="mt-8">
        <details className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
          <summary className="cursor-pointer text-sm font-medium text-neutral-600 dark:text-neutral-300">
            Raw enrichment from {account.externalCrmProvider ?? 'CRM'}
          </summary>
          <pre className="mt-3 overflow-x-auto rounded bg-neutral-50 p-3 text-xs text-neutral-700 dark:bg-neutral-900 dark:text-neutral-300">
            {account.enrichment
              ? JSON.stringify(account.enrichment, null, 2)
              : '(no enrichment data yet)'}
          </pre>
        </details>
      </section>
    </main>
  );
}
