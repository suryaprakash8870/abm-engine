/**
 * /guide — comprehensive "how to use every engine" documentation.
 *
 * Each engine gets a section with:
 *  - title + hook + intro paragraph
 *  - annotated screenshot (numbered marker overlays positioned over the image)
 *  - numbered manual steps ("what to do")
 *  - "behind the scenes" data + invariants
 *  - open-the-live-page CTA
 *
 * Screenshots are captured by scripts/capture-guide.ts and saved to
 * /public/guide/screenshots/. When missing, a placeholder renders instead.
 */

import Link from 'next/link';
import { GUIDE_ENGINES, type GuideEngine } from '@/lib/guide/config';

export default function GuidePage() {
  return (
    <div className="space-y-12 pb-20">
      {/* Hero */}
      <header className="animate-rise space-y-5">
        <p className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[10.5px] font-medium uppercase tracking-[0.18em] text-white/55">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_8px_2px_rgba(197,251,80,0.6)]" />
          Guide · how to use every engine
        </p>
        <h1 className="font-display text-[40px] font-medium leading-[1.05] tracking-tight text-white sm:text-[52px]">
          A picture-by-picture walk
          <br />
          through every engine.
        </h1>
        <p className="max-w-2xl text-[15px] leading-relaxed text-white/55">
          Each engine has its own page. This guide shows a screenshot of each,
          with <span className="text-accent">numbered markers</span> pointing at the
          things you should click and a short list of steps. Load the demo data first,
          then follow along.
        </p>

        <div className="flex flex-wrap gap-3 pt-1">
          <Link
            href="/demo"
            className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-[13px] font-semibold text-accent-foreground shadow-[0_12px_28px_-14px_rgba(197,251,80,0.65)] transition hover:bg-accent-hover"
          >
            Load demo data →
          </Link>
          <a
            href="#engine-01"
            className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/[0.04] px-4 py-2.5 text-[13px] font-medium text-white/85 transition hover:bg-white/[0.08]"
          >
            Start at Engine 01 ↓
          </a>
        </div>
      </header>

      <div className="grid gap-10 lg:grid-cols-[180px_minmax(0,1fr)]">
        {/* Sticky sidebar nav */}
        <nav className="hidden lg:block">
          <div className="sticky top-24 space-y-1">
            <p className="mb-3 text-[10px] font-medium uppercase tracking-[0.18em] text-white/35">
              Engines
            </p>
            {GUIDE_ENGINES.map((e) => (
              <a
                key={e.num}
                href={`#engine-${e.num}`}
                className="group flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-[12.5px] transition hover:bg-white/[0.04]"
              >
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-md border border-white/15 bg-white/[0.04] font-mono text-[10px] text-white/55 transition group-hover:border-accent/50 group-hover:text-accent">
                  {e.num}
                </span>
                <span className="truncate text-white/70 group-hover:text-white">{e.name}</span>
              </a>
            ))}
          </div>
        </nav>

        {/* Sections */}
        <div className="space-y-14 min-w-0">
          {GUIDE_ENGINES.map((e) => (
            <EngineSection key={e.num} engine={e} />
          ))}
        </div>
      </div>

      {/* End — loop closes */}
      <section className="relative overflow-hidden rounded-2xl border border-accent/20 bg-gradient-to-br from-accent/[0.06] via-transparent to-transparent p-8 md:p-10">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-20 -right-20 h-[360px] w-[360px] rounded-full"
          style={{
            background: 'radial-gradient(circle, rgba(197,251,80,0.32), transparent 70%)',
            filter: 'blur(60px)',
          }}
        />
        <p className="mb-3 text-[10.5px] font-medium uppercase tracking-[0.18em] text-accent">
          You've reached the loop
        </p>
        <h2 className="font-display text-[28px] font-medium leading-tight tracking-tight text-white sm:text-[32px]">
          The eleven engines feed each other.
        </h2>
        <p className="mt-4 max-w-2xl text-[14.5px] leading-relaxed text-white/65">
          ICP → TAM → Enrichment → Scoring → TAL → Contacts → Signals → Awareness → Plays → CRM → Flywheel → ICP.
          The Flywheel closes the loop: every fifth deal you win refreshes the ICP, so the next cycle targets better customers.
        </p>
      </section>
    </div>
  );
}

function EngineSection({ engine: e }: { engine: GuideEngine }) {
  return (
    <section id={`engine-${e.num}`} className="scroll-mt-24 space-y-6">
      {/* Heading */}
      <div className="flex items-start gap-4">
        <div className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-accent/30 bg-accent/[0.08] font-mono text-lg font-medium text-accent">
          <span
            aria-hidden
            className="absolute inset-0 -z-10 rounded-2xl opacity-70"
            style={{
              background: 'radial-gradient(circle, rgba(197,251,80,0.30), transparent 70%)',
              filter: 'blur(10px)',
            }}
          />
          {e.num}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10.5px] font-medium uppercase tracking-[0.18em] text-white/35">
            Engine {e.num}
          </p>
          <h2 className="font-display text-[26px] font-medium leading-tight tracking-tight text-white sm:text-[30px]">
            {e.name}
          </h2>
          <p className="mt-1 text-[14px] font-medium text-accent/85">{e.hook}</p>
        </div>
      </div>

      {/* Intro */}
      <p className="max-w-3xl text-[14.5px] leading-relaxed text-white/75">{e.intro}</p>

      {/* Annotated screenshot */}
      <ScreenshotWithMarkers engine={e} />

      {/* Two-column: steps + behind */}
      <div className="grid gap-5 md:grid-cols-2">
        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5">
          <p className="mb-3 text-[10.5px] font-medium uppercase tracking-[0.16em] text-accent">
            What to do
          </p>
          <ol className="space-y-2.5">
            {e.steps.map((s, idx) => (
              <li key={idx} className="flex items-start gap-3 text-[13.5px] leading-relaxed text-white/80">
                <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/15 font-mono text-[10.5px] font-semibold text-accent">
                  {idx + 1}
                </span>
                <span>{s}</span>
              </li>
            ))}
          </ol>
        </div>

        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5">
          <p className="mb-3 text-[10.5px] font-medium uppercase tracking-[0.16em] text-white/40">
            Behind the scenes
          </p>
          <p className="text-[13.5px] leading-relaxed text-white/65">{e.behind}</p>
          <div className="mt-5">
            <Link
              href={e.href}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-[12.5px] font-semibold text-accent-foreground shadow-[0_8px_20px_-10px_rgba(197,251,80,0.6)] transition hover:bg-accent-hover"
            >
              Open the live page
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M13 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

function ScreenshotWithMarkers({ engine: e }: { engine: GuideEngine }) {
  return (
    <figure className="space-y-3">
      {/* The captured screenshot — lime numbered badges baked in by Playwright. */}
      <div className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-black/40">
        <div className="relative w-full" style={{ aspectRatio: '16 / 10' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={e.screenshot}
            alt={`${e.name} screenshot`}
            className="absolute inset-0 h-full w-full object-cover object-top"
            loading="lazy"
          />
        </div>
        <figcaption className="border-t border-white/[0.06] bg-canvas/40 px-5 py-3 text-[11.5px] text-white/50">
          <span className="font-mono text-accent/80">{e.markers.length}</span> markers on{' '}
          <code className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[11px] text-white/80">{e.href}</code>
        </figcaption>
      </div>

      {/* Labels list — explains each numbered marker on the screenshot. */}
      <ol className="grid gap-2 sm:grid-cols-2">
        {e.markers.map((m) => (
          <li key={m.n} className="flex items-start gap-2.5 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-[12.5px] leading-snug text-white/75">
            <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent font-mono text-[10.5px] font-semibold text-accent-foreground shadow-[0_0_0_2px_rgba(8,9,11,0.9),0_0_8px_rgba(197,251,80,0.55)]">
              {m.n}
            </span>
            <span>{m.label}</span>
          </li>
        ))}
      </ol>
    </figure>
  );
}
