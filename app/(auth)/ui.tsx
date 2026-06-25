/**
 * Shared marketing-panel for the auth split view (login + signup).
 * Renders the brand, hero copy, the 11-engine pulse list, and a footer stat.
 * Hidden on mobile — auth pages collapse to form-only when narrow.
 */

import Link from 'next/link';

const ENGINES: { num: string; name: string; tag: string }[] = [
  { num: '01', name: 'ICP Engine', tag: 'Profile the ideal customer' },
  { num: '02', name: 'TAM Builder', tag: 'Source every matching company' },
  { num: '03', name: 'Enrichment', tag: 'AI-qualify each account' },
  { num: '04', name: 'Scoring', tag: 'Fit score + tier' },
  { num: '05', name: 'TAL Manager', tag: 'Maintain the target list' },
  { num: '06', name: 'Contacts', tag: 'Map the buying committee' },
  { num: '07', name: 'Signals', tag: 'Track buying intent live' },
  { num: '08', name: 'Awareness', tag: 'Score + route hot accounts' },
  { num: '09', name: 'Orchestrator', tag: 'Run the right play' },
  { num: '10', name: 'CRM Sync', tag: 'Write everything back' },
  { num: '11', name: 'GTM Flywheel', tag: 'Learn from every deal' },
];

export function AuthMarketing() {
  return (
    <aside
      aria-hidden
      className="relative hidden overflow-hidden lg:flex lg:flex-col lg:justify-between bg-canvas px-10 py-10 xl:px-14 xl:py-12"
    >
      {/* Ambient glows */}
      <div className="pointer-events-none absolute -top-32 -left-20">
        <div
          className="animate-breathe-soft h-[520px] w-[520px] rounded-full"
          style={{
            background:
              'radial-gradient(circle, rgba(197,251,80,0.34), rgba(133,221,53,0.10) 45%, transparent 70%)',
            filter: 'blur(70px)',
          }}
        />
      </div>
      <div className="pointer-events-none absolute -bottom-40 -right-24">
        <div
          className="h-[460px] w-[460px] rounded-full opacity-70"
          style={{
            background:
              'radial-gradient(circle, rgba(56,189,248,0.14), transparent 65%)',
            filter: 'blur(80px)',
          }}
        />
      </div>
      {/* Grain */}
      <div className="bg-grain pointer-events-none absolute inset-0 opacity-[0.35]" />

      {/* Brand */}
      <Link href="/" className="relative z-10 inline-flex items-center gap-2.5 self-start">
        <span className="inline-block h-2.5 w-2.5 rounded-full bg-accent shadow-[0_0_18px_4px_rgba(197,251,80,0.55)]" />
        <span className="font-display text-sm font-semibold tracking-wide uppercase text-white/85">
          ABM Engine
        </span>
      </Link>

      {/* Hero copy + engine list */}
      <div className="relative z-10 max-w-[520px] space-y-8">
        <div className="space-y-4">
          <p className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[10.5px] uppercase tracking-[0.18em] text-white/55">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent" />
            Eleven engines · one event bus
          </p>
          <h1 className="font-display text-[38px] font-medium leading-[1.05] tracking-tight text-white xl:text-[48px]">
            Strategy <span className="text-accent">+</span> execution.
            <br />
            All in one ABM system.
          </h1>
          <p className="max-w-md text-[14.5px] leading-relaxed text-white/55">
            From the ideal-customer profile to the closed-won feedback loop —
            a CRM-agnostic intelligence layer for go-to-market teams.
          </p>
        </div>

        {/* Engine list — 2 cols on lg, taglines surface on xl */}
        <ol className="grid grid-cols-2 gap-x-6 gap-y-1.5">
          {ENGINES.map((e, i) => (
            <li key={e.num} className="group flex items-center gap-2.5">
              <span
                className="animate-pulse-dot inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-accent"
                style={{ animationDelay: `${i * 0.22}s` }}
              />
              <span className="font-mono text-[10px] tracking-wider text-white/30 tabular-nums">
                {e.num}
              </span>
              <span className="text-[13px] font-medium text-white/80">{e.name}</span>
            </li>
          ))}
        </ol>
      </div>

      {/* Footer card */}
      <div className="relative z-10 max-w-[520px]">
        <blockquote className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-sm">
          <p className="text-[13.5px] leading-relaxed text-white/75">
            “Replaces five tools we were stitching together — and learns from every
            deal we close.”
          </p>
          <footer className="mt-2.5 flex items-center gap-2 text-[11px] text-white/40">
            <span className="inline-block h-[1px] w-6 bg-white/30" />
            Builder · Founding team
          </footer>
        </blockquote>
      </div>
    </aside>
  );
}

/**
 * "Continue with Google" button. A plain anchor to the server-side OAuth start
 * route (no client JS needed) — carries `next` so the user lands where they meant
 * to go after sign-in.
 */
export function GoogleAuthButton({ next = '/today', label = 'Continue with Google' }: { next?: string; label?: string }) {
  const href = `/api/v1/auth/google?next=${encodeURIComponent(next)}`;
  return (
    <a
      href={href}
      className="flex w-full items-center justify-center gap-3 rounded-xl border border-white/12 bg-white/[0.04] px-4 py-3 text-sm font-medium text-white/85 transition hover:border-white/25 hover:bg-white/[0.07]"
    >
      <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden>
        <path fill="#FFC107" d="M43.6 20.5h-1.9V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8a12 12 0 1 1 0-24c3 0 5.8 1.1 7.9 3l5.7-5.7A20 20 0 1 0 24 44c11 0 20-8 20-20 0-1.3-.1-2.3-.4-3.5z" />
        <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8A12 12 0 0 1 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7A20 20 0 0 0 6.3 14.7z" />
        <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2A12 12 0 0 1 12.7 28l-6.5 5A20 20 0 0 0 24 44z" />
        <path fill="#1976D2" d="M43.6 20.5H24v8h11.3a12 12 0 0 1-4.1 5.6l6.2 5.2c-.4.4 6.6-4.8 6.6-14.3 0-1.3-.1-2.3-.4-3.5z" />
      </svg>
      {label}
    </a>
  );
}

/** "or" divider between OAuth and the email form. */
export function AuthDivider() {
  return (
    <div className="flex items-center gap-3">
      <span className="h-px flex-1 bg-white/10" />
      <span className="text-[11px] uppercase tracking-wider text-white/30">or</span>
      <span className="h-px flex-1 bg-white/10" />
    </div>
  );
}
