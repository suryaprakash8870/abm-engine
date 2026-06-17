'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { WIZARD_QUESTIONS } from '@/lib/engines/icp-engine/types';
import { submitWizard, getWizardStatus } from '@/lib/web/icp-api';
import { me } from '@/lib/web/auth-api';

const STAGES = [
  'Analysing your answers…',
  'Mapping firmographics…',
  'Identifying target industries…',
  'Profiling the ideal buyer…',
  'Modelling technographic signals…',
  'Defining buying triggers…',
  'Building exclusion rules…',
  'Scoring confidence levels…',
  'Validating the profile…',
  'Finalising your ICP…',
];

function firstName(email: string): string {
  const local = (email.split('@')[0] ?? '').split(/[._\-+]/)[0] || 'there';
  return local.charAt(0).toUpperCase() + local.slice(1);
}

export default function WizardPage() {
  const router = useRouter();
  const total = WIZARD_QUESTIONS.length;

  const [answers, setAnswers] = useState<Record<string, string>>(() =>
    Object.fromEntries(WIZARD_QUESTIONS.map((q) => [q.id, ''])),
  );
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [name, setName] = useState('there');
  const [elapsed, setElapsed] = useState(0);
  const [simPct, setSimPct] = useState(0);
  const [stageIdx, setStageIdx] = useState(0);

  useEffect(() => {
    void me().then((r) => {
      if (r.ok && r.data?.email) setName(firstName(r.data.email));
    });
  }, []);

  // Elapsed timer + simulated progress while generating.
  useEffect(() => {
    if (!sessionId) { setElapsed(0); setSimPct(0); setStageIdx(0); return; }
    const start = Date.now();
    const TOTAL_MS = 42_000; // ~42 s to reach 95 %
    const iv = setInterval(() => {
      const t = Date.now() - start;
      setElapsed(Math.floor(t / 1000));
      setSimPct(Math.min(95, Math.round((t / TOTAL_MS) * 95)));
      setStageIdx(Math.min(STAGES.length - 1, Math.floor((t / TOTAL_MS) * STAGES.length)));
    }, 500);
    return () => clearInterval(iv);
  }, [sessionId]);

  // Poll wizard status once a session has been created.
  useEffect(() => {
    if (!sessionId) return;
    let active = true;
    const tick = async () => {
      const r = await getWizardStatus(sessionId);
      if (!active || !r.ok) return;
      const data = r.data!;
      if (data.status === 'completed' && data.icp_id) {
        router.push('/icp/' + data.icp_id);
      } else if (data.status === 'failed') {
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

  const next = () => setStep((s) => Math.min(total - 1, s + 1));
  const back = () => setStep((s) => Math.max(0, s - 1));

  async function handleGenerate() {
    setSubmitting(true);
    setErrorMsg('');
    const r = await submitWizard(answers);
    if (!r.ok) {
      let message = r.error?.message || 'Something went wrong.';
      if (r.status === 0 || r.status >= 500) {
        message += ' Make sure the worker, Redis and database are running.';
      }
      setErrorMsg(message);
      setSubmitting(false);
      return;
    }
    setSessionId(r.data!.session_id);
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!current || submitting) return;
      if (isLast) void handleGenerate();
      else next();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-[#0b0d14] text-white">
      {/* breathing blue glow */}
      <div
        className="animate-breathe pointer-events-none absolute left-1/2 top-1/2 h-[680px] w-[680px] rounded-full"
        style={{
          background:
            'radial-gradient(circle, rgba(66,108,255,0.55), rgba(82,120,255,0.16) 42%, transparent 70%)',
          filter: 'blur(50px)',
        }}
      />

      {/* top bar */}
      <div className="relative z-10 flex items-center justify-between px-6 py-5 sm:px-8">
        <span className="font-display text-sm font-medium tracking-tight text-white/70">ICP Engine</span>
        <button onClick={() => router.push('/icp')} className="text-sm text-white/40 transition hover:text-white">
          Exit
        </button>
      </div>

      <div className="relative z-10 flex flex-1 items-center justify-center px-6 pb-24">
        <div className="w-full max-w-2xl">
          {sessionId ? (
            <div className="animate-rise text-center">
              <h1 className="font-display text-3xl font-medium tracking-tight text-white sm:text-4xl">
                Building your ICP, {name}…
              </h1>
              <p className="mt-3 text-sm text-white/45">{STAGES[stageIdx]}</p>

              {/* progress bar */}
              <div className="mx-auto mt-8 w-full max-w-sm">
                <div className="flex items-center justify-between text-xs text-white/35 mb-2">
                  <span className="tabular-nums">{simPct}%</span>
                  <span className="tabular-nums">{elapsed}s elapsed</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-blue-400 transition-all duration-500"
                    style={{ width: `${simPct}%` }}
                  />
                </div>
              </div>

              {/* stage dots */}
              <div className="mt-6 flex justify-center gap-1.5">
                {STAGES.map((_, i) => (
                  <span
                    key={i}
                    className={`inline-block h-1 rounded-full transition-all duration-300 ${
                      i < stageIdx ? 'w-3 bg-blue-400' : i === stageIdx ? 'w-5 bg-blue-400' : 'w-1 bg-white/15'
                    }`}
                  />
                ))}
              </div>

              {elapsed < 90 ? (
                <p className="mt-6 text-xs text-white/25">This usually takes 20–40 seconds</p>
              ) : (
                <div className="mt-6 rounded-xl border border-amber-400/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
                  Taking longer than expected.{' '}
                  <span className="font-medium">Make sure <code className="rounded bg-white/10 px-1">npm run worker</code> is running in a separate terminal</span>{' '}
                  — the worker processes the Claude synthesis job.
                </div>
              )}
            </div>
          ) : (
            <div key={step} className="animate-rise">
              <p className="mb-3 text-sm font-medium text-blue-300/70">
                Question {step + 1} of {total}
              </p>
              <h1 className="font-display text-3xl font-medium leading-[1.15] tracking-tight text-white sm:text-[2.6rem]">
                {q.prompt}
              </h1>
              <p className="mt-4 text-[15px] text-white/45">{q.helper}</p>

              {/* Gemini-style prompt pill */}
              <div className="mt-8 flex items-end gap-3 rounded-[28px] border border-white/10 bg-white/[0.05] px-5 py-3.5 shadow-2xl shadow-blue-950/40 backdrop-blur-xl transition focus-within:border-white/25">
                <span className="select-none pb-0.5 text-xl text-white/35" aria-hidden>
                  +
                </span>
                <textarea
                  autoFocus
                  rows={1}
                  value={answers[q.id] ?? ''}
                  placeholder={`Type your answer, ${name}…`}
                  onChange={(e) => {
                    setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }));
                    e.target.style.height = 'auto';
                    e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
                  }}
                  onKeyDown={onKey}
                  className="max-h-40 flex-1 resize-none self-center bg-transparent py-1 text-base text-white placeholder-white/25 outline-none"
                />
                <button
                  type="button"
                  onClick={() => (isLast ? void handleGenerate() : next())}
                  disabled={!current || submitting}
                  aria-label={isLast ? 'Generate ICP' : 'Next'}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-500 text-white transition hover:bg-blue-400 disabled:bg-white/10 disabled:text-white/30"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 19V5M5 12l7-7 7 7" />
                  </svg>
                </button>
              </div>

              {/* progress + nav */}
              <div className="mt-5 flex items-center justify-between text-xs text-white/40">
                <button onClick={back} disabled={step === 0} className="transition hover:text-white disabled:opacity-25">
                  ← Back
                </button>
                <div className="flex items-center gap-2">
                  <div className="h-1 w-40 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full rounded-full bg-blue-400 transition-all duration-500" style={{ width: `${progressPct}%` }} />
                  </div>
                  <span className="tabular-nums">{Math.round(progressPct)}%</span>
                </div>
                <span className="text-white/25">Enter ↵</span>
              </div>

              {errorMsg && (
                <div className="mt-5 rounded-xl border border-red-400/25 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                  {errorMsg}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
