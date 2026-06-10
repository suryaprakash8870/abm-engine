'use client';

import { useState, useRef } from 'react';
import { apiFetch } from '@/lib/api-client';

// ─── Types (mirror the backend) ─────────────────────────────────────────────

type FreqEntry = { value: string; count: number; pct: number };
type PatternField = { field: string; rawColumn: string; topValues: FreqEntry[]; insight: string };
type DerivedRule = { field: string; match: string | string[]; points: number; reason: string };
type AnalysisResult = {
  totalRows: number;
  wonRows: number;
  columnMap: Record<string, string | null>;
  unmappedColumns: string[];
  patterns: PatternField[];
  derivedRules: DerivedRule[];
};
type ScoredProspect = {
  name: string;
  domain: string;
  industry: string | null;
  employees: string | null;
  country: string | null;
  fitScore: number;
  tier: 1 | 2 | 3 | null;
  breakdown: Array<{ field: string; value: string; points: number; reason: string }>;
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function TierBadge({ tier }: { tier: 1 | 2 | 3 | null }) {
  if (tier === 1) return <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">T1</span>;
  if (tier === 2) return <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300">T2</span>;
  if (tier === 3) return <span className="rounded-full bg-neutral-200 px-2 py-0.5 text-xs font-medium text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">T3</span>;
  return <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-950 dark:text-red-300">Drop</span>;
}

function FreqBar({ entry, max }: { entry: FreqEntry; max: number }) {
  const width = max > 0 ? Math.round((entry.pct / max) * 100) : 0;
  return (
    <div className="flex items-center gap-2 text-sm">
      <div className="w-28 flex-shrink-0 truncate text-neutral-700 dark:text-neutral-300">{entry.value}</div>
      <div className="flex-1 rounded bg-neutral-100 dark:bg-neutral-800">
        <div className="h-2 rounded bg-emerald-500" style={{ width: `${width}%` }} />
      </div>
      <div className="w-14 text-right tabular-nums text-neutral-500">{entry.pct}%</div>
    </div>
  );
}

function StepBadge({ n, active, done }: { n: number; active: boolean; done: boolean }) {
  const base = 'flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-sm font-semibold';
  if (done) return <span className={`${base} bg-emerald-500 text-white`}>✓</span>;
  if (active) return <span className={`${base} bg-neutral-900 text-white dark:bg-white dark:text-neutral-900`}>{n}</span>;
  return <span className={`${base} border-2 border-neutral-300 text-neutral-400 dark:border-neutral-700`}>{n}</span>;
}

function FileDropZone({ label, accept, onChange }: { label: string; accept: string; onChange: (f: File) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [name, setName] = useState<string | null>(null);

  const handle = (f: File) => { setName(f.name); onChange(f); };

  return (
    <div
      className="flex cursor-pointer flex-col items-center rounded-lg border-2 border-dashed border-neutral-300 p-6 text-center transition hover:border-neutral-500 dark:border-neutral-700 dark:hover:border-neutral-500"
      onClick={() => ref.current?.click()}
      onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handle(f); }}
      onDragOver={(e) => e.preventDefault()}
    >
      <input ref={ref} type="file" accept={accept} className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handle(f); }} />
      <div className="text-2xl">📄</div>
      {name
        ? <p className="mt-2 text-sm font-medium text-emerald-700 dark:text-emerald-400">{name}</p>
        : <><p className="mt-2 text-sm font-medium">{label}</p><p className="text-xs text-neutral-500">Click or drag CSV here</p></>
      }
    </div>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────

export default function IcpLabPage() {
  const [wonFile, setWonFile] = useState<File | null>(null);
  const [prospectFile, setProspectFile] = useState<File | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [prospects, setProspects] = useState<ScoredProspect[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const step = analysis ? (prospects ? 3 : 2) : 1;

  async function runAnalysis() {
    if (!wonFile || !prospectFile) return;
    setLoading(true);
    setError(null);
    setAnalysis(null);
    setProspects(null);

    try {
      const form = new FormData();
      form.append('won', wonFile);
      form.append('prospects', prospectFile);

      const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000';
      const res = await fetch(`${API_BASE}/api/icp/analyze-and-score`, { method: 'POST', body: form });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: res.statusText }));
        throw new Error((err as { message?: string }).message ?? res.statusText);
      }
      const data = await res.json() as { analysis: AnalysisResult; prospects: ScoredProspect[] };
      setAnalysis(data.analysis);
      setProspects(data.prospects);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const tierCount = (t: 1 | 2 | 3 | null) => prospects?.filter((p) => p.tier === t).length ?? 0;

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      {/* Header */}
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">ICP Lab</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Upload your won-accounts CSV → detect the pattern → score new prospects automatically.
        </p>
        <div className="mt-3 flex gap-3 text-xs text-neutral-500">
          <a href="/sample-won-accounts.csv" download className="underline hover:text-neutral-800 dark:hover:text-neutral-200">↓ Sample won-accounts CSV</a>
          <span>·</span>
          <a href="/sample-prospects.csv" download className="underline hover:text-neutral-800 dark:hover:text-neutral-200">↓ Sample prospects CSV (Apollo-style)</a>
        </div>
      </header>

      {/* Step indicators */}
      <div className="mb-8 flex items-center gap-3">
        {[
          { n: 1, label: 'Upload CSVs' },
          { n: 2, label: 'Pattern found' },
          { n: 3, label: 'Prospects scored' },
        ].map((s, i) => (
          <div key={s.n} className="flex items-center gap-2">
            {i > 0 && <span className="text-neutral-300 dark:text-neutral-700">──</span>}
            <StepBadge n={s.n} active={step === s.n} done={step > s.n} />
            <span className={`text-sm ${step === s.n ? 'font-medium' : 'text-neutral-400'}`}>{s.label}</span>
          </div>
        ))}
      </div>

      {/* Step 1 — upload */}
      <section className="mb-8 rounded-lg border border-neutral-200 p-5 dark:border-neutral-800">
        <h2 className="mb-4 text-sm font-medium uppercase tracking-wider text-neutral-500">Step 1 — Upload your data</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-medium text-neutral-700 dark:text-neutral-300">Won accounts (past CRM data)</p>
            <FileDropZone label="Won accounts CSV" accept=".csv,.txt" onChange={setWonFile} />
            <p className="mt-1 text-xs text-neutral-400">Needs columns like: industry, employees, country. Include a <code>status</code> column with "closed_won" to filter.</p>
          </div>
          <div>
            <p className="mb-2 text-xs font-medium text-neutral-700 dark:text-neutral-300">New prospects (Apollo / dummy export)</p>
            <FileDropZone label="Prospects CSV" accept=".csv,.txt" onChange={setProspectFile} />
            <p className="mt-1 text-xs text-neutral-400">Same column structure as the won file — e.g. Apollo company export.</p>
          </div>
        </div>

        <div className="mt-5 flex items-center gap-3">
          <button
            onClick={runAnalysis}
            disabled={!wonFile || !prospectFile || loading}
            className="rounded-md bg-neutral-900 px-5 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
          >
            {loading ? 'Analyzing…' : 'Find ICP pattern & score prospects →'}
          </button>
          {wonFile && prospectFile && !loading && !analysis && (
            <span className="text-xs text-emerald-600 dark:text-emerald-400">Both files ready ✓</span>
          )}
        </div>

        {error && (
          <div className="mt-4 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
            {error}
          </div>
        )}
      </section>

      {/* Step 2 — patterns */}
      {analysis && (
        <section className="mb-8 rounded-lg border border-neutral-200 p-5 dark:border-neutral-800">
          <h2 className="mb-1 text-sm font-medium uppercase tracking-wider text-neutral-500">Step 2 — ICP pattern detected</h2>
          <p className="mb-4 text-xs text-neutral-400">
            Analysed {analysis.wonRows} won accounts out of {analysis.totalRows} rows.
            {analysis.unmappedColumns.length > 0 && ` Columns not mapped: ${analysis.unmappedColumns.join(', ')}.`}
          </p>

          {/* Column mapping */}
          <div className="mb-5 flex flex-wrap gap-2">
            {Object.entries(analysis.columnMap).filter(([, v]) => v).map(([k, v]) => (
              <span key={k} className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">
                {k} → <strong>{v}</strong>
              </span>
            ))}
          </div>

          {/* Pattern charts */}
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {analysis.patterns.map((p) => {
              const maxPct = p.topValues[0]?.pct ?? 1;
              return (
                <div key={p.field} className="rounded-lg border border-neutral-100 bg-neutral-50 p-4 dark:border-neutral-800 dark:bg-neutral-900">
                  <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-neutral-500">{p.field}</div>
                  <p className="mb-3 text-xs italic text-neutral-400">{p.insight}</p>
                  <div className="space-y-1.5">
                    {p.topValues.slice(0, 5).map((e) => <FreqBar key={e.value} entry={e} max={maxPct} />)}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Derived rubric */}
          <div className="mt-5">
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-neutral-500">Auto-derived ICP rules (used to score prospects)</h3>
            <div className="overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-800">
              <table className="min-w-full divide-y divide-neutral-200 dark:divide-neutral-800">
                <thead className="bg-neutral-50 dark:bg-neutral-900">
                  <tr>
                    {['Field', 'Matching values', 'Points', 'Reason'].map((h) => (
                      <th key={h} className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-neutral-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200 bg-white dark:divide-neutral-800 dark:bg-neutral-950">
                  {analysis.derivedRules.map((r, i) => (
                    <tr key={i}>
                      <td className="px-3 py-2 text-sm font-medium">{r.field}</td>
                      <td className="px-3 py-2 text-sm text-neutral-500">
                        {Array.isArray(r.match) ? r.match.join(', ') : r.match}
                      </td>
                      <td className="px-3 py-2 text-sm font-semibold text-emerald-700 dark:text-emerald-400">+{r.points}</td>
                      <td className="px-3 py-2 text-xs text-neutral-400">{r.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* Step 3 — scored prospects */}
      {prospects && (
        <section className="rounded-lg border border-neutral-200 p-5 dark:border-neutral-800">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-sm font-medium uppercase tracking-wider text-neutral-500">Step 3 — Prospects scored</h2>
              <p className="mt-1 text-xs text-neutral-400">{prospects.length} prospects ranked by ICP fit. Click any row to see the breakdown.</p>
            </div>
            <div className="flex gap-3 text-sm">
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">{tierCount(1)} T1</span>
              <span className="font-semibold text-amber-600 dark:text-amber-400">{tierCount(2)} T2</span>
              <span className="font-semibold text-neutral-500">{tierCount(3)} T3</span>
              <span className="font-semibold text-red-500">{tierCount(null)} Drop</span>
            </div>
          </div>

          <div className="overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-800">
            <table className="min-w-full divide-y divide-neutral-200 dark:divide-neutral-800">
              <thead className="bg-neutral-50 dark:bg-neutral-900">
                <tr>
                  {['Score', 'Tier', 'Company', 'Industry', 'Employees', 'Country'].map((h) => (
                    <th key={h} className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-neutral-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 bg-white dark:divide-neutral-800 dark:bg-neutral-950">
                {prospects.map((p) => (
                  <>
                    <tr
                      key={p.domain}
                      className="cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-900"
                      onClick={() => setExpandedRow(expandedRow === p.domain ? null : p.domain)}
                    >
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <div
                            className="h-2 rounded-full bg-emerald-500"
                            style={{ width: `${Math.max(4, p.fitScore)}px`, maxWidth: '60px' }}
                          />
                          <span className="text-sm font-semibold tabular-nums">{p.fitScore}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5"><TierBadge tier={p.tier} /></td>
                      <td className="px-3 py-2.5">
                        <div className="text-sm font-medium">{p.name}</div>
                        <div className="text-xs text-neutral-400">{p.domain}</div>
                      </td>
                      <td className="px-3 py-2.5 text-sm text-neutral-500">{p.industry ?? '—'}</td>
                      <td className="px-3 py-2.5 text-sm text-neutral-500">{p.employees ?? '—'}</td>
                      <td className="px-3 py-2.5 text-sm text-neutral-500">{p.country ?? '—'}</td>
                    </tr>
                    {expandedRow === p.domain && (
                      <tr key={`${p.domain}-detail`} className="bg-neutral-50 dark:bg-neutral-900">
                        <td colSpan={6} className="px-4 py-3">
                          <div className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-2">Score breakdown</div>
                          <div className="space-y-1">
                            {p.breakdown.map((b, i) => (
                              <div key={i} className="flex items-start gap-3 text-sm">
                                <span className={`w-16 flex-shrink-0 font-semibold tabular-nums ${b.points > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-neutral-400'}`}>
                                  {b.points > 0 ? `+${b.points}` : '0'}
                                </span>
                                <span className="w-24 flex-shrink-0 font-medium">{b.field}</span>
                                <span className="w-32 flex-shrink-0 text-neutral-600 dark:text-neutral-400">{b.value}</span>
                                <span className="text-neutral-500">{b.reason}</span>
                              </div>
                            ))}
                          </div>
                          <div className="mt-2 border-t border-neutral-200 pt-2 text-sm font-semibold dark:border-neutral-800">
                            Total: {p.fitScore}/100 → <TierBadge tier={p.tier} />
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  );
}
