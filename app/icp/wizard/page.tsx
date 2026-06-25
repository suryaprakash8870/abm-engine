'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { WIZARD_QUESTIONS } from '@/lib/engines/icp-engine/types';
import { analyzeBusiness, submitWizard, getWizardStatus } from '@/lib/web/icp-api';
import { me } from '@/lib/web/auth-api';

const OUTCOME_CHIPS: { title: string; sub: string }[] = [
  { title: 'Build your ICP', sub: 'Target company criteria' },
  { title: 'Buyer personas', sub: 'Decision-maker profiles' },
  { title: 'Intent signals', sub: 'Buying-trigger alerts' },
];

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
  // 'intake' = paste URL / describe → AI prefills; 'questions' = the 12-question review.
  const [phase, setPhase] = useState<'intake' | 'questions'>('intake');
  const [bizInput, setBizInput] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
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

  // Intake: paste a URL/description → Claude drafts the 12 answers → review them.
  async function handleAnalyze() {
    if (!bizInput.trim() || analyzing) return;
    setAnalyzing(true);
    setErrorMsg('');
    const r = await analyzeBusiness(bizInput.trim());
    if (r.ok && r.data?.answers) {
      setAnswers((prev) => ({ ...prev, ...r.data!.answers }));
      setStep(0);
      setPhase('questions');
    } else {
      setErrorMsg(r.error?.message ?? 'Could not analyze that. Try a fuller description, or answer manually.');
    }
    setAnalyzing(false);
  }

  const skipToManual = () => {
    setErrorMsg('');
    setStep(0);
    setPhase('questions');
  };

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
    <div className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-canvas text-white">
      {/* breathing lime glow */}
      <div
        className="animate-breathe pointer-events-none absolute left-1/2 top-1/2 h-[680px] w-[680px] rounded-full"
        style={{
          background:
            'radial-gradient(circle, rgba(197,251,80,0.45), rgba(133,221,53,0.12) 42%, transparent 70%)',
          filter: 'blur(58px)',
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
                    className="h-full rounded-full bg-accent shadow-[0_0_12px_rgba(197,251,80,0.55)] transition-all duration-500"
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
                      i < stageIdx ? 'w-3 bg-accent' : i === stageIdx ? 'w-5 bg-accent shadow-[0_0_8px_rgba(197,251,80,0.55)]' : 'w-1 bg-white/15'
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
          ) : phase === 'intake' ? (
            <div className="animate-rise">
              <p className="mb-3 inline-flex items-center gap-2 text-sm font-medium text-accent/80">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_8px_rgba(197,251,80,0.6)]" />
                Let&rsquo;s build your ICP
              </p>
              <h1 className="font-display text-3xl font-medium leading-[1.15] tracking-tight text-white sm:text-[2.6rem]">
                Tell us about your business, {name}.
              </h1>
              <p className="mt-4 text-[15px] text-white/45">
                Paste your website or LinkedIn, or describe what you sell. AI drafts your ICP — you just refine it.
              </p>

              {/* Intake prompt pill */}
              <div className="mt-8 flex items-end gap-3 rounded-[28px] border border-white/10 bg-white/[0.05] px-5 py-3.5 shadow-2xl shadow-black/40 backdrop-blur-xl transition focus-within:border-accent/40 focus-within:shadow-[0_0_0_1px_rgba(197,251,80,0.18),0_25px_50px_-12px_rgba(0,0,0,0.5)]">
                <span className="select-none pb-0.5 text-xl text-white/35" aria-hidden>+</span>
                <textarea
                  autoFocus
                  rows={1}
                  value={bizInput}
                  placeholder="yourcompany.com — or: “We sell CRM software to mid-market SaaS teams”"
                  onChange={(e) => {
                    setBizInput(e.target.value);
                    e.target.style.height = 'auto';
                    e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      void handleAnalyze();
                    }
                  }}
                  className="max-h-40 flex-1 resize-none self-center bg-transparent py-1 text-base text-white placeholder-white/25 outline-none"
                />
                <button
                  type="button"
                  onClick={() => void handleAnalyze()}
                  disabled={!bizInput.trim() || analyzing}
                  aria-label="Analyze with AI"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground transition hover:bg-accent-hover disabled:bg-white/10 disabled:text-white/30"
                >
                  {analyzing ? (
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-accent-foreground/30 border-t-accent-foreground" />
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z" />
                    </svg>
                  )}
                </button>
              </div>

              {/* Actions */}
              <div className="mt-4 flex items-center justify-between gap-3">
                <button
                  onClick={() => void handleAnalyze()}
                  disabled={!bizInput.trim() || analyzing}
                  className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground shadow-[0_8px_24px_-12px_rgba(197,251,80,0.55)] transition hover:bg-accent-hover disabled:bg-white/10 disabled:text-white/30 disabled:shadow-none"
                >
                  {analyzing ? 'Analyzing…' : '✦ Analyze with AI'}
                </button>
                <button onClick={skipToManual} className="text-sm text-white/40 transition hover:text-white">
                  I&rsquo;ll answer manually →
                </button>
              </div>

              {/* Outcome chips — what the AI step produces */}
              <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-3">
                {OUTCOME_CHIPS.map((c) => (
                  <div key={c.title} className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
                    <p className="flex items-center gap-2 text-sm font-medium text-white/85">
                      <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent" />
                      {c.title}
                    </p>
                    <p className="mt-1 text-xs text-white/40">{c.sub}</p>
                  </div>
                ))}
              </div>

              {errorMsg && (
                <div className="mt-5 rounded-xl border border-red-400/25 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                  {errorMsg}
                </div>
              )}
            </div>
          ) : (
            <div key={step} className="animate-rise">
              <p className="mb-3 inline-flex items-center gap-2 text-sm font-medium text-accent/80">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_8px_rgba(197,251,80,0.6)]" />
                Question {step + 1} of {total}
              </p>
              <h1 className="font-display text-3xl font-medium leading-[1.15] tracking-tight text-white sm:text-[2.6rem]">
                {q.prompt}
              </h1>
              <p className="mt-4 text-[15px] text-white/45">{q.helper}</p>

              {/* Prompt pill */}
              <div className="mt-8 flex items-end gap-3 rounded-[28px] border border-white/10 bg-white/[0.05] px-5 py-3.5 shadow-2xl shadow-black/40 backdrop-blur-xl transition focus-within:border-accent/40 focus-within:shadow-[0_0_0_1px_rgba(197,251,80,0.18),0_25px_50px_-12px_rgba(0,0,0,0.5)]">
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
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground transition hover:bg-accent-hover disabled:bg-white/10 disabled:text-white/30"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 19V5M5 12l7-7 7 7" />
                  </svg>
                </button>
              </div>

              {/* progress + nav */}
              <div className="mt-5 flex items-center justify-between text-xs text-white/40">
                <button
                  onClick={() => (step === 0 ? setPhase('intake') : back())}
                  className="transition hover:text-white"
                >
                  ← Back
                </button>
                <div className="flex items-center gap-2">
                  <div className="h-1 w-40 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full rounded-full bg-accent transition-all duration-500" style={{ width: `${progressPct}%` }} />
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
