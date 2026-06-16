'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { WIZARD_QUESTIONS } from '@/lib/engines/icp-engine/types';
import { submitWizard, getWizardStatus } from '@/lib/web/icp-api';
import { Card, SectionTitle, PrimaryButton, Banner } from '../ui';

export default function WizardPage() {
  const router = useRouter();
  const total = WIZARD_QUESTIONS.length;

  const [answers, setAnswers] = useState<Record<string, string>>(() =>
    Object.fromEntries(WIZARD_QUESTIONS.map((q) => [q.id, ''])),
  );
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Poll wizard status once a session has been created.
  useEffect(() => {
    if (!sessionId) return;
    let active = true;

    const tick = async () => {
      const r = await getWizardStatus(sessionId);
      if (!active) return;
      if (!r.ok) return; // transient; keep polling
      const data = r.data!;
      if (data.status === 'completed' && data.icp_id) {
        router.push('/icp/' + data.icp_id);
        return;
      }
      if (data.status === 'failed') {
        setErrorMsg(data.error || 'Synthesis failed. Please try again.');
        setSessionId(null);
      }
    };

    const interval = setInterval(tick, 2000);
    void tick();
    return () => {
      active = false;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const q = WIZARD_QUESTIONS[step];
  const current = (answers[q.id] ?? '').trim();
  const isLast = step === total - 1;
  const progressPct = ((step + 1) / total) * 100;

  function setAnswer(value: string) {
    setAnswers((prev) => ({ ...prev, [q.id]: value }));
  }

  async function handleGenerate() {
    setSubmitting(true);
    setErrorMsg('');
    const r = await submitWizard(answers);
    if (!r.ok) {
      let message = r.error?.message || 'Something went wrong.';
      if (r.status === 0 || r.status >= 500) {
        message +=
          ' The backend needs ANTHROPIC_API_KEY, REDIS_URL and a migrated database to run synthesis.';
      }
      setErrorMsg(message);
      setSubmitting(false);
      return;
    }
    setSessionId(r.data!.session_id);
    setStatusMsg('Generating your ICP…');
  }

  // ── Generating state ─────────────────────────────────────────────────────────
  if (sessionId) {
    return (
      <Card>
        <SectionTitle>Hypothesis Wizard</SectionTitle>
        <div className="mt-6 flex flex-col items-center justify-center gap-4 py-10 text-center">
          <span
            className="h-8 w-8 animate-spin rounded-full border-2 border-gray-200 border-t-gray-900"
            aria-hidden="true"
          />
          <p className="text-sm font-medium text-gray-700">
            {statusMsg || 'Generating your ICP…'}
          </p>
          <p className="text-xs text-gray-400">
            This can take a moment while we synthesise your answers.
          </p>
        </div>
      </Card>
    );
  }

  // ── Wizard state ─────────────────────────────────────────────────────────────
  return (
    <Card>
      <SectionTitle>Hypothesis Wizard</SectionTitle>

      <div className="mt-4">
        <div className="mb-1 flex items-center justify-between text-xs text-gray-500">
          <span>
            Question {step + 1} of {total}
          </span>
          <span>{Math.round(progressPct)}%</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
          <div
            className="h-full bg-gray-900 transition-all"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      <div className="mt-6">
        <label htmlFor="wizard-answer" className="block text-base font-medium text-gray-900">
          {q.prompt}
        </label>
        <p className="mt-1 text-sm text-gray-500">{q.helper}</p>
        <textarea
          id="wizard-answer"
          rows={3}
          value={answers[q.id] ?? ''}
          onChange={(e) => setAnswer(e.target.value)}
          className="mt-3 w-full resize-y rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
        />
      </div>

      {errorMsg && (
        <div className="mt-4">
          <Banner tone="red">{errorMsg}</Banner>
        </div>
      )}

      <div className="mt-6 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Back
        </button>

        {isLast ? (
          <PrimaryButton type="button" onClick={handleGenerate} disabled={!current || submitting}>
            {submitting ? 'Generating…' : 'Generate ICP'}
          </PrimaryButton>
        ) : (
          <button
            type="button"
            onClick={() => setStep((s) => Math.min(total - 1, s + 1))}
            disabled={!current}
            className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Next
          </button>
        )}
      </div>
    </Card>
  );
}
