'use client';

/**
 * TourBanner — fixed-bottom guided-tour overlay. Reads the current step from
 * localStorage (set by /demo's "Start tour" button), shows what the user is
 * looking at on this page, and navigates to the next/prev engine when they
 * click the buttons.
 *
 * Renders nothing when no tour is active — so the cost on normal page loads
 * is just one useEffect that checks localStorage and exits.
 */

import { useEffect, useMemo, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { TOUR_STEPS, TOUR_TOTAL, type TourStep } from './config';
import { exitTour, getTourStep, setTourStep } from './state';

export function TourBanner() {
  const router = useRouter();
  const pathname = usePathname();
  const [step, setStep] = useState<number | null>(null);
  const [hydrated, setHydrated] = useState(false);

  // Read initial state + subscribe to changes.
  useEffect(() => {
    setStep(getTourStep());
    setHydrated(true);
    const onChange = (e: Event) => {
      const ce = e as CustomEvent<{ step: number | null }>;
      setStep(ce.detail.step);
    };
    window.addEventListener('abm-tour-changed', onChange);
    // Also listen for cross-tab updates.
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'abm_tour_step') setStep(getTourStep());
    };
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('abm-tour-changed', onChange);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const current: TourStep | null = useMemo(
    () => (step ? TOUR_STEPS.find((s) => s.step === step) ?? null : null),
    [step],
  );

  if (!hydrated || !current) return null;

  const prev = step && step > 1 ? TOUR_STEPS[step - 2] : null;
  const next = step && step < TOUR_TOTAL ? TOUR_STEPS[step] : null;
  // Accept the engine's root href OR any dynamic child of it (so /icp counts
  // as "on the page" even after auto-redirect to /icp/[icpId]).
  const onCorrectPage = pathname === current.href || pathname.startsWith(current.href + '/');

  const goPrev = () => {
    if (!prev) return;
    setTourStep(prev.step);
    router.push(prev.href);
  };
  const goNext = () => {
    if (!next) {
      // End of tour — exit and stay on current page.
      exitTour();
      return;
    }
    setTourStep(next.step);
    router.push(next.href);
  };
  const goToCurrent = () => {
    router.push(current.href);
  };
  const close = () => {
    exitTour();
  };

  return (
    <>
      {/* Spacer so the page bottom isn't hidden behind the fixed banner. */}
      <div aria-hidden className="h-[148px] sm:h-[112px]" />

      <div
        role="region"
        aria-label="Guided tour"
        className="fixed inset-x-0 bottom-0 z-30"
      >
        {/* Top hairline glow */}
        <div className="h-px w-full bg-gradient-to-r from-transparent via-accent/40 to-transparent" />

        <div className="border-t border-accent/15 bg-canvas/85 backdrop-blur-2xl">
          <div className="mx-auto flex max-w-5xl flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:gap-6">
            {/* Step badge */}
            <div className="flex shrink-0 items-center gap-3">
              <div className="relative flex h-11 w-11 items-center justify-center rounded-xl border border-accent/35 bg-accent/[0.08] font-mono text-[14px] font-medium text-accent">
                <span
                  aria-hidden
                  className="absolute inset-0 -z-10 rounded-xl opacity-70"
                  style={{
                    background: 'radial-gradient(circle, rgba(197,251,80,0.30), transparent 70%)',
                    filter: 'blur(8px)',
                  }}
                />
                {current.num}
              </div>
              <div className="leading-tight">
                <p className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-white/40">
                  Step {current.step} / {TOUR_TOTAL}
                </p>
                <p className="font-display text-[14px] font-medium text-white">{current.name}</p>
              </div>
            </div>

            {/* Hint */}
            <div className="min-w-0 flex-1 space-y-0.5">
              <p className="truncate text-[13.5px] font-medium text-white/90">{current.headline}</p>
              <p className="line-clamp-2 text-[12.5px] leading-snug text-white/55 sm:line-clamp-1">
                {current.hint}
              </p>
            </div>

            {/* Progress dots (compact, just for orientation) */}
            <div className="hidden items-center gap-1 lg:flex">
              {TOUR_STEPS.map((s) => (
                <button
                  key={s.step}
                  onClick={() => {
                    setTourStep(s.step);
                    router.push(s.href);
                  }}
                  aria-label={`Jump to step ${s.step} — ${s.name}`}
                  className={`h-1.5 rounded-full transition-all ${
                    s.step === current.step
                      ? 'w-5 bg-accent shadow-[0_0_6px_rgba(197,251,80,0.6)]'
                      : s.step < current.step
                        ? 'w-1.5 bg-accent/50 hover:bg-accent/70'
                        : 'w-1.5 bg-white/15 hover:bg-white/30'
                  }`}
                />
              ))}
            </div>

            {/* Nav */}
            <div className="flex shrink-0 items-center gap-2">
              {!onCorrectPage && (
                <button
                  onClick={goToCurrent}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-accent/40 bg-accent/[0.08] px-3 py-1.5 text-[12px] font-semibold text-accent transition hover:bg-accent/[0.14]"
                >
                  Go to page
                </button>
              )}
              <button
                onClick={goPrev}
                disabled={!prev}
                className="rounded-lg border border-white/12 bg-white/[0.04] px-3 py-1.5 text-[12px] font-medium text-white/75 transition hover:border-white/25 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
              >
                ← Prev
              </button>
              <button
                onClick={goNext}
                className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-1.5 text-[12.5px] font-semibold text-accent-foreground shadow-[0_8px_20px_-10px_rgba(197,251,80,0.65)] transition hover:bg-accent-hover"
              >
                {next ? <>Next: {next.name} →</> : <>Finish tour ✓</>}
              </button>
              <button
                onClick={close}
                aria-label="Exit tour"
                className="ml-1 rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1.5 text-[14px] text-white/45 transition hover:border-white/25 hover:text-white"
              >
                ×
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
