'use client';

import { useRouter } from 'next/navigation';
import { TOUR_STEPS, TOUR_TOTAL } from '@/lib/tour/config';
import { exitTour, setTourStep } from '@/lib/tour/state';

/**
 * StartTour — the activator block on /demo. Sets tour state and navigates to
 * Engine 01's page. From there the global TourBanner takes over and walks the
 * user through every engine page.
 */
export function StartTour() {
  const router = useRouter();
  const first = TOUR_STEPS[0];

  const start = () => {
    setTourStep(1);
    router.push(first.href);
  };

  const exit = () => {
    exitTour();
  };

  return (
    <section className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.025] p-7 backdrop-blur-sm md:p-9">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 -left-12 h-[320px] w-[320px] rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(197,251,80,0.20), transparent 70%)',
          filter: 'blur(60px)',
        }}
      />

      <div className="relative grid items-center gap-6 md:grid-cols-[1.4fr_1fr]">
        <div className="space-y-3">
          <p className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[10.5px] font-medium uppercase tracking-[0.18em] text-white/55">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_8px_2px_rgba(197,251,80,0.6)]" />
            Guided tour · {TOUR_TOTAL} engines
          </p>
          <h2 className="font-display text-[26px] font-medium leading-tight tracking-tight text-white sm:text-[30px]">
            Walk every engine, one page at a time.
          </h2>
          <p className="max-w-xl text-[14px] leading-relaxed text-white/65">
            We&rsquo;ll take you to <span className="text-white/85">/icp</span> first. From there, a banner at the bottom of the screen tells you what to look at — click <span className="text-accent">Next</span> and we navigate to the next engine&rsquo;s page. Try things manually as you go. Press <span className="text-white/85">×</span> any time to exit.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <button
            onClick={start}
            className="group inline-flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-5 py-3 text-[14px] font-semibold text-accent-foreground shadow-[0_18px_36px_-18px_rgba(197,251,80,0.7)] transition hover:bg-accent-hover hover:shadow-[0_22px_44px_-16px_rgba(197,251,80,0.85)]"
          >
            Start the guided tour
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M13 5l7 7-7 7" />
            </svg>
          </button>
          <button
            onClick={exit}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.04] px-5 py-2.5 text-[12.5px] font-medium text-white/65 transition hover:border-white/25 hover:text-white"
          >
            Stop any active tour
          </button>
        </div>
      </div>

      {/* Tour map — small list of step → page so the user knows what they're in for */}
      <ol className="relative mt-7 grid grid-cols-2 gap-x-6 gap-y-1.5 border-t border-white/[0.06] pt-5 sm:grid-cols-3 lg:grid-cols-4">
        {TOUR_STEPS.map((s) => (
          <li key={s.step} className="flex items-center gap-2.5 text-[12px]">
            <span className="font-mono text-[10px] tabular-nums text-white/30">{s.num}</span>
            <span className="text-white/70">{s.name}</span>
            <span className="font-mono text-[10.5px] text-white/30">{s.href}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
