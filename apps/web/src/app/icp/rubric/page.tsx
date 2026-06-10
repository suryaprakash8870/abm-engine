'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';

type Rubric = {
  id: string;
  version: number;
  name: string | null;
  weights: Record<string, unknown>;
  createdAt: string;
};

type SaveRubricResponse = { rubric: Rubric; rescored: number };

function useRubric() {
  return useQuery<Rubric>({
    queryKey: ['rubric'],
    queryFn: () => apiFetch<Rubric>('/api/rubric'),
    retry: false, // 404 = "no rubric yet" — don't hammer the API
    refetchOnWindowFocus: false, // don't clobber an in-progress edit
  });
}

function Code({ children }: { children: string }) {
  return (
    <code className="rounded bg-neutral-200 px-1 py-0.5 font-mono text-xs dark:bg-neutral-800">
      {children}
    </code>
  );
}

export default function RubricPage() {
  const queryClient = useQueryClient();
  const rubric = useRubric();

  const [draft, setDraft] = useState('');
  const [parseError, setParseError] = useState<string | null>(null);

  // Initialize the editor once per loaded rubric version. A save creates a NEW
  // version (new id) → the refetch re-syncs the editor to the canonical JSON.
  const rubricId = rubric.data?.id;
  useEffect(() => {
    if (rubric.data) {
      setDraft(JSON.stringify(rubric.data.weights, null, 2));
      setParseError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rubricId]);

  const save = useMutation<SaveRubricResponse, Error, { weights: Record<string, unknown> }>({
    mutationFn: (body) =>
      apiFetch<SaveRubricResponse>('/api/rubric', {
        method: 'PUT',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rubric'] });
    },
  });

  function handleSave() {
    setParseError(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(draft);
    } catch (e) {
      setParseError(`Invalid JSON: ${(e as Error).message}`);
      return;
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      setParseError('Weights must be a JSON object, e.g. { "industry": { … }, … }');
      return;
    }
    save.mutate({ weights: parsed as Record<string, unknown> });
  }

  const noRubricYet = rubric.isError && rubric.error.message.startsWith('404');

  return (
    <main className="mx-auto max-w-7xl px-6 py-10">
      <header className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">ICP Rubric</h1>
          <p className="mt-1 text-sm text-neutral-500">
            {rubric.isLoading && 'Loading…'}
            {rubric.data &&
              `Active: v${rubric.data.version}${rubric.data.name ? ` · ${rubric.data.name}` : ''} · created ${new Date(rubric.data.createdAt).toLocaleString()}`}
            {noRubricYet && 'No active rubric'}
          </p>
        </div>
        {!noRubricYet && (
          <button
            onClick={handleSave}
            disabled={save.isPending || rubric.isLoading || !draft}
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
          >
            {save.isPending ? 'Saving…' : 'Save as new version'}
          </button>
        )}
      </header>

      <div className="mb-6 rounded-md border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm leading-relaxed text-neutral-600 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-400">
        Saving creates a <strong>new version</strong> (append-only — old versions are kept for
        audit) and immediately <strong>re-scores all accounts</strong> against it. Weights must
        contain <Code>industry</Code>, <Code>employeesBands</Code> and <Code>tierThresholds</Code>{' '}
        (the server validates this). Optional: add a <Code>technologies</Code> map — e.g.{' '}
        <Code>{'{"HubSpot": 10}'}</Code> — to score accounts whose enriched tech stack contains
        those tools.
      </div>

      {noRubricYet && (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          No rubric yet — run a sync or seed first.
        </div>
      )}

      {rubric.isError && !noRubricYet && (
        <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {rubric.error.message}
        </div>
      )}

      {!rubric.isError && (
        <>
          <textarea
            rows={24}
            spellCheck={false}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setParseError(null);
            }}
            placeholder={rubric.isLoading ? 'Loading rubric…' : ''}
            className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 font-mono text-sm leading-relaxed shadow-sm focus:border-neutral-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-900"
          />

          {parseError && (
            <div className="mt-3 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
              {parseError}
            </div>
          )}

          {save.isError && (
            <div className="mt-3 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
              Save failed: {save.error.message}
            </div>
          )}

          {save.isSuccess && (
            <div className="mt-3 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
              Saved v{save.data.rubric.version} — re-scored {save.data.rescored} accounts
            </div>
          )}
        </>
      )}
    </main>
  );
}
