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

type AwarenessStage = 'identified' | 'aware' | 'engaged' | 'considering' | 'selecting';

type Contact = {
  id: string;
  email: string | null;
  phone: string | null;
  firstName: string | null;
  lastName: string | null;
  title: string | null;
  role: 'decision_maker' | 'champion' | 'influencer' | 'unknown';
};

type ContactsResponse = { count: number; contacts: Contact[] };

type Signal = {
  id: string;
  type: string;
  party: 'first' | 'second' | 'third';
  source: string | null;
  weight: number;
  occurredAt: string;
  ingestedAt: string;
};

type SignalsResponse = { count: number; signals: Signal[] };

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
    signalScore: number | null;
    awarenessStage: AwarenessStage | null;
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

const STAGE_STYLES: Record<AwarenessStage, { label: string; className: string }> = {
  identified: {
    label: 'Identified',
    className: 'bg-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300',
  },
  aware: {
    label: 'Aware',
    className: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300',
  },
  engaged: {
    label: 'Engaged',
    className: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300',
  },
  considering: {
    label: 'Considering',
    className: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  },
  selecting: {
    label: 'Selecting',
    className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  },
};

function StageBadge({ stage, big = false }: { stage: AwarenessStage; big?: boolean }) {
  const sizing = big ? 'px-3 py-1 text-sm' : 'px-2 py-0.5 text-xs';
  const s = STAGE_STYLES[stage];
  return (
    <span className={`inline-flex items-center rounded-full font-medium ${s.className} ${sizing}`}>
      {s.label}
    </span>
  );
}

const ROLE_STYLES: Record<Contact['role'], { label: string; className: string }> = {
  decision_maker: {
    label: 'Decision Maker',
    className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  },
  champion: {
    label: 'Champion',
    className: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300',
  },
  influencer: {
    label: 'Influencer',
    className: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300',
  },
  unknown: {
    label: 'Unknown',
    className: 'bg-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300',
  },
};

function RoleBadge({ role }: { role: Contact['role'] }) {
  const r = ROLE_STYLES[role] ?? ROLE_STYLES.unknown;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${r.className}`}
    >
      {r.label}
    </span>
  );
}

const PARTY_STYLES: Record<Signal['party'], { label: string; className: string }> = {
  first: {
    label: '1st',
    className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  },
  second: {
    label: '2nd',
    className: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  },
  third: {
    label: '3rd',
    className: 'bg-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300',
  },
};

function PartyBadge({ party }: { party: Signal['party'] }) {
  const p = PARTY_STYLES[party] ?? PARTY_STYLES.third;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${p.className}`}
    >
      {p.label}
    </span>
  );
}

function contactName(c: Contact): string {
  return [c.firstName, c.lastName].filter(Boolean).join(' ') || '—';
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
  const contacts = useQuery<ContactsResponse>({
    queryKey: ['account-contacts', id],
    queryFn: () => apiFetch<ContactsResponse>(`/api/accounts/${id}/contacts`),
    enabled: Boolean(id),
  });
  const signals = useQuery<SignalsResponse>({
    queryKey: ['account-signals', id],
    queryFn: () => apiFetch<SignalsResponse>(`/api/signals?accountId=${id}`),
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
          {score.signalScore !== null && (
            <div>
              <div className="text-xs uppercase tracking-wider text-neutral-500">Signal</div>
              <div className="mt-1 text-4xl font-semibold tabular-nums">{score.signalScore}</div>
            </div>
          )}
          <div className="flex flex-col items-start gap-1.5 pb-1">
            <TierBadge tier={score.tier} big />
            {score.awarenessStage && <StageBadge stage={score.awarenessStage} big />}
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

      {/* ─── Stakeholders ────────────────────────────────────────── */}
      <section className="mt-8">
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-neutral-500">
          Stakeholders
        </h2>

        {contacts.isLoading && <p className="text-sm text-neutral-500">Loading contacts…</p>}

        {contacts.isError && (
          <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
            {(contacts.error as Error).message}
          </div>
        )}

        {contacts.data && contacts.data.contacts.length === 0 && (
          <div className="rounded-md border border-neutral-200 bg-neutral-50 px-4 py-6 text-sm text-neutral-500 dark:border-neutral-800 dark:bg-neutral-900">
            No contacts synced yet — contacts sync runs automatically after each account sync.
          </div>
        )}

        {contacts.data && contacts.data.contacts.length > 0 && (
          <div className="overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-800">
            <table className="min-w-full divide-y divide-neutral-200 dark:divide-neutral-800">
              <thead className="bg-neutral-50 dark:bg-neutral-900">
                <tr>
                  {['Name', 'Title', 'Email', 'Role'].map((h) => (
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
                {contacts.data.contacts.map((c) => (
                  <tr key={c.id}>
                    <td className="whitespace-nowrap px-4 py-3 text-sm font-medium">
                      {contactName(c)}
                    </td>
                    <td className="px-4 py-3 text-sm text-neutral-600 dark:text-neutral-400">
                      {c.title ?? '—'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-neutral-500">
                      {c.email ?? '—'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm">
                      <RoleBadge role={c.role} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ─── Recent signals ──────────────────────────────────────── */}
      <section className="mt-8">
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-neutral-500">
          Recent signals
        </h2>

        {signals.isLoading && <p className="text-sm text-neutral-500">Loading signals…</p>}

        {signals.isError && (
          <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
            {(signals.error as Error).message}
          </div>
        )}

        {signals.data && signals.data.signals.length === 0 && (
          <div className="rounded-md border border-neutral-200 bg-neutral-50 px-4 py-6 text-sm text-neutral-500 dark:border-neutral-800 dark:bg-neutral-900">
            No signals yet — POST /api/signals or wait for tracker events.
          </div>
        )}

        {signals.data && signals.data.signals.length > 0 && (
          <div className="overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-800">
            <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
              {[...signals.data.signals]
                .sort(
                  (a, b) =>
                    new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
                )
                .map((s) => (
                  <li
                    key={s.id}
                    className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 bg-white px-4 py-3 dark:bg-neutral-950"
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-sm">{s.type}</span>
                      <PartyBadge party={s.party} />
                    </div>
                    <div className="flex items-center gap-4 text-sm text-neutral-500">
                      <span className="tabular-nums">weight {s.weight}</span>
                      <span>{new Date(s.occurredAt).toLocaleDateString()}</span>
                    </div>
                  </li>
                ))}
            </ul>
          </div>
        )}
      </section>
    </main>
  );
}
