export default function HomePage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">ABM Engine</h1>
      <p className="mt-3 text-neutral-600 dark:text-neutral-400">
        CRM-agnostic ABM intelligence layer. Phase 0 scaffold — engine modules
        are stubbed.
      </p>

      <section className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {[
          { name: 'Enrichment', phase: 'Phase 1' },
          { name: 'Scoring', phase: 'Phase 1' },
          { name: 'Signal Scorer', phase: 'Phase 2' },
          { name: 'Orchestrator', phase: 'Phase 3 (gated)' },
          { name: 'CRM Adapter', phase: 'Phase 1 (HubSpot)' },
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
