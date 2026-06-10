import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">ABM Engine</h1>
      <p className="mt-3 text-neutral-600 dark:text-neutral-400">
        CRM-agnostic ABM intelligence layer. Phase 1 — CRM Adapter + sync wired;
        scoring and orchestration to come.
      </p>

      <div className="mt-8">
        <Link
          href="/accounts"
          className="inline-block rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
        >
          Open accounts →
        </Link>
      </div>

      <section className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {[
          { name: 'CRM Adapter', phase: 'Phase 1 — HubSpot wired' },
          { name: 'Enrichment', phase: 'Phase 1 — pending' },
          { name: 'Scoring', phase: 'Phase 1 — pending' },
          { name: 'Signal Scorer', phase: 'Phase 2' },
          { name: 'Orchestrator', phase: 'Phase 3 (gated)' },
        ].map((c) => (
          <div
            key={c.name}
            className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800"
          >
            <div className="font-medium">{c.name}</div>
            <div className="text-sm text-neutral-500">{c.phase}</div>
          </div>
        ))}
      </section>
    </main>
  );
}
