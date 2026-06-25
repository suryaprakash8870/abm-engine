import Link from 'next/link';
import { GlowBackground } from '@/lib/web/shell';

/**
 * Public marketing landing (/). Unauthenticated, so it's the highest-traffic URL
 * and PostHog (mounted in the root layout) logs every visit as a first-party
 * signal. Server component — all motion is CSS, the FAQ uses native <details>.
 */

export const metadata = {
  title: 'ABM Engine — Turn anonymous traffic into pipeline',
  description:
    'Eleven AI engines that find your buyers, score intent, and fire the right play — automatically. The full account-based GTM stack, one login.',
};

const OUTCOMES = [
  { k: '01', title: 'Find the right companies', body: 'Build your ICP, then source every matching account from the open web — no list-buying.', tag: 'ICP · TAM' },
  { k: '02', title: 'Score real intent', body: 'Fit + first-party behaviour + third-party signals collapse into one number per account.', tag: 'Scoring · Signals' },
  { k: '03', title: 'Map the buying committee', body: 'Every stakeholder, verified email, and role — assembled without manual research.', tag: 'Contacts' },
  { k: '04', title: 'Catch the moment', body: 'Funding, hiring, launches, pricing-page visits — surfaced the instant they happen.', tag: 'Awareness' },
  { k: '05', title: 'Fire the right play', body: 'The orchestrator routes hot accounts to the next best action and writes it back to your CRM.', tag: 'Plays · CRM' },
];

const STACK = [
  ['Intent data platform', '$0', 'first-party signals built in'],
  ['Enrichment provider', 'BYO key', 'or use ours, metered'],
  ['List-building tool', '$0', 'TAM sourced from the open web'],
  ['Workflow automation', '$0', '11 engines on an event bus'],
  ['AI copywriter', '$0', 'local LLM — no per-token bill'],
];

const FEATURES = [
  { title: 'First-party signal tracking', body: 'One snippet turns site visits from target accounts into scored signals. No cookies, no PII.', icon: 'radar' },
  { title: 'Third-party web research', body: 'Crawl a company and the local LLM extracts funding, hiring, and launch signals on demand.', icon: 'globe' },
  { title: 'Always-on scoring', body: 'Time-decayed account and awareness scores update continuously as new signals arrive.', icon: 'gauge' },
  { title: 'CRM-native write-back', body: 'Upsert (never overwrite) into HubSpot — every play, score, and signal lands on the record.', icon: 'sync' },
  { title: 'Runs on your AI', body: 'Reasoning, summaries, and drafts run through a local Ollama model by default. Your data stays home.', icon: 'cpu' },
  { title: 'Event-driven by design', body: 'Eleven independent engines, one event bus. Each does one job and verifies before it reports done.', icon: 'bolt' },
];

const INTEGRATIONS = ['HubSpot', 'Salesforce', 'Apollo', 'Clearbit', 'Clay', 'Firecrawl', 'Slack', 'Resend', 'Telegram', 'PostHog'];

const TESTIMONIALS = [
  { quote: 'We stopped paying for three tools and stopped guessing which accounts were warm. The signal score is the first dashboard my reps actually open.', name: 'Priya N.', role: 'VP Growth, Seed-stage SaaS' },
  { quote: 'The buying-committee map alone replaced a contractor. It pulls the whole org chart and the emails are real.', name: 'Marcus L.', role: 'Head of Demand Gen' },
  { quote: 'It writes back to HubSpot cleanly — no duplicate contacts, no overwritten fields. That trust was the whole ballgame.', name: 'Dana R.', role: 'RevOps Lead' },
];

const FAQ = [
  ['How is this different from an intent-data vendor?', 'Intent vendors sell you third-party signals. We combine your own first-party behaviour (the strongest intent there is) with third-party research and fit — into one score, and then act on it.'],
  ['Do I need to connect a CRM?', 'No. A CRM is optional — the Plays queue is a complete in-app action surface. Connect HubSpot when you want two-way sync; everything works without it.'],
  ['Where does the AI run?', 'On a local LLM (Ollama) by default, so your account data never leaves your environment for routine reasoning. You can point it at a hosted model if you prefer.'],
  ['Can I bring my own enrichment keys?', 'Yes. Apollo, Clearbit, Clay, Firecrawl, Slack, Resend, and Telegram are all bring-your-own-key — stored encrypted, never logged.'],
  ['How quickly can I see value?', 'Drop the tracking snippet on your site and you start logging signals from target accounts the same day.'],
];

export default function Home() {
  return (
    <div className="relative min-h-screen overflow-x-hidden text-white">
      <GlowBackground />

      {/* ── Nav ─────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-canvas/70 backdrop-blur-xl">
        <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="h-2.5 w-2.5 rounded-full bg-accent shadow-[0_0_14px_2px_rgba(197,251,80,0.6)]" />
            <span className="font-display text-[15px] font-semibold tracking-tight">ABM ENGINE</span>
          </Link>
          <div className="hidden items-center gap-7 text-[13.5px] text-white/55 md:flex">
            <a href="#outcomes" className="transition hover:text-white">Product</a>
            <a href="#stack" className="transition hover:text-white">Pricing</a>
            <a href="#features" className="transition hover:text-white">Features</a>
            <a href="#faq" className="transition hover:text-white">FAQ</a>
          </div>
          <div className="flex items-center gap-2.5">
            <Link href="/login" className="rounded-lg px-3.5 py-2 text-[13.5px] font-medium text-white/70 transition hover:text-white">Log in</Link>
            <Link href="/signup" className="rounded-lg bg-accent px-4 py-2 text-[13.5px] font-semibold text-accent-foreground shadow-[0_8px_24px_-12px_rgba(197,251,80,0.6)] transition hover:bg-accent-hover">
              Start free
            </Link>
          </div>
        </nav>
      </header>

      {/* ── Hero ────────────────────────────────────────────── */}
      <section className="relative mx-auto max-w-6xl px-6 pb-20 pt-20 lg:pt-28">
        <div className="animate-rise inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3.5 py-1.5 text-[12px] text-white/60">
          <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-accent" />
          11 engines · one event bus · your AI
        </div>

        <h1 className="animate-rise mt-6 max-w-3xl font-display text-[40px] font-medium leading-[1.05] tracking-tight sm:text-[56px] lg:text-[64px]" style={{ animationDelay: '60ms' }}>
          Turn anonymous traffic into{' '}
          <span className="relative whitespace-nowrap text-accent">
            real pipeline
            <span className="absolute inset-x-0 -bottom-1 h-2 -skew-x-6 rounded bg-accent/20" />
          </span>
          .
        </h1>

        <p className="animate-rise mt-6 max-w-xl text-[16px] leading-relaxed text-white/55" style={{ animationDelay: '120ms' }}>
          Eleven AI engines find your buyers, score their intent the moment it spikes, and fire the
          right play — then write it all back to your CRM. The full account-based GTM stack, one login.
        </p>

        <div className="animate-rise mt-8 flex flex-wrap items-center gap-3" style={{ animationDelay: '180ms' }}>
          <Link href="/signup" className="group rounded-xl bg-accent px-6 py-3 text-sm font-semibold text-accent-foreground shadow-[0_12px_32px_-12px_rgba(197,251,80,0.6)] transition hover:bg-accent-hover">
            Start free <span className="inline-block transition-transform group-hover:translate-x-0.5">→</span>
          </Link>
          <Link href="/demo" className="rounded-xl border border-white/15 bg-white/[0.04] px-6 py-3 text-sm font-medium text-white transition hover:bg-white/10">
            See how it works
          </Link>
        </div>
        <p className="animate-rise mt-4 text-[12.5px] text-white/35" style={{ animationDelay: '220ms' }}>
          No credit card · runs on your local AI · your data stays yours
        </p>

        {/* Hero mock: a live signal feed card */}
        <div className="animate-rise mt-16" style={{ animationDelay: '280ms' }}>
          <div className="relative mx-auto max-w-4xl rounded-3xl border border-white/10 bg-white/[0.025] p-2 shadow-[0_40px_120px_-40px_rgba(0,0,0,0.9)] bg-grain">
            <div className="rounded-[20px] border border-white/[0.06] bg-canvas/80 p-5 sm:p-7">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-[13px] text-white/70"><span className="h-2 w-2 animate-pulse-dot rounded-full bg-accent" /> Live signal feed</div>
                <span className="rounded-full border border-accent/30 bg-accent/10 px-2.5 py-1 text-[11px] font-medium text-accent">3 hot accounts</span>
              </div>
              <div className="mt-5 space-y-2.5">
                {[
                  ['Northwind Labs', 'Pricing page · 3 visits', 92, 'funding_round'],
                  ['Cobalt Systems', 'Demo request viewed', 87, 'hiring_surge'],
                  ['Meridian Cloud', 'Product launch detected', 74, 'product_launch'],
                ].map(([name, evt, score, kind]) => (
                  <div key={name as string} className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-[14px] font-medium text-white/90">{name}</p>
                      <p className="truncate text-[12px] text-white/40">{evt} · <span className="text-accent/80">{(kind as string).replace(/_/g, ' ')}</span></p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="hidden h-1.5 w-24 overflow-hidden rounded-full bg-white/10 sm:block">
                        <div className="h-full rounded-full bg-accent" style={{ width: `${score}%` }} />
                      </div>
                      <span className="w-8 text-right font-display text-[15px] font-semibold text-accent">{score as number}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Logos strip ─────────────────────────────────────── */}
      <section className="border-y border-white/[0.06] bg-white/[0.015]">
        <div className="mx-auto max-w-6xl px-6 py-7">
          <p className="text-center text-[11px] uppercase tracking-[0.2em] text-white/30">Plugs into the tools you already run</p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-[14px] font-medium text-white/40">
            {INTEGRATIONS.map((i) => <span key={i} className="transition hover:text-white/70">{i}</span>)}
          </div>
        </div>
      </section>

      {/* ── Outcomes ────────────────────────────────────────── */}
      <Section id="outcomes" eyebrow="One workflow" title="Five outcomes, zero busywork" sub="Each engine owns one job and hands off to the next. You see the results — not the plumbing.">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {OUTCOMES.map((o) => (
            <div key={o.k} className="group rounded-2xl border border-white/[0.07] bg-white/[0.02] p-6 transition hover:border-accent/30 hover:bg-white/[0.04]">
              <div className="flex items-center justify-between">
                <span className="font-display text-[13px] font-semibold text-accent/70">{o.k}</span>
                <span className="rounded-full border border-white/10 px-2.5 py-0.5 text-[10.5px] uppercase tracking-wide text-white/40">{o.tag}</span>
              </div>
              <h3 className="mt-4 font-display text-[18px] font-medium text-white">{o.title}</h3>
              <p className="mt-2 text-[13.5px] leading-relaxed text-white/50">{o.body}</p>
            </div>
          ))}
          <div className="flex flex-col justify-center rounded-2xl border border-accent/20 bg-accent/[0.06] p-6">
            <p className="font-display text-[18px] font-medium text-white">All five, connected.</p>
            <p className="mt-2 text-[13.5px] text-white/55">The output of one engine is the trigger for the next — a closed loop from stranger to closed-won.</p>
            <Link href="/pipeline" className="mt-4 text-[13.5px] font-semibold text-accent transition hover:text-accent-hover">See the pipeline →</Link>
          </div>
        </div>
      </Section>

      {/* ── Stack replacement ───────────────────────────────── */}
      <Section id="stack" eyebrow="Pricing" title="Replace the $295/mo stack" sub="One platform does what a shelf of point tools used to — and the AI runs locally, so there's no per-token meter ticking.">
        <div className="mx-auto max-w-2xl overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02]">
          {STACK.map(([name, price, note], i) => (
            <div key={name} className={`flex items-center justify-between px-5 py-4 ${i !== STACK.length - 1 ? 'border-b border-white/[0.06]' : ''}`}>
              <div>
                <p className="text-[14px] text-white/80 line-through decoration-white/20">{name}</p>
                <p className="text-[12px] text-white/40">{note}</p>
              </div>
              <span className="rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-[12.5px] font-semibold text-accent">{price}</span>
            </div>
          ))}
          <div className="flex items-center justify-between bg-accent/[0.08] px-5 py-5">
            <p className="font-display text-[16px] font-medium text-white">Your bill</p>
            <p className="font-display text-[22px] font-semibold text-accent">one login</p>
          </div>
        </div>
      </Section>

      {/* ── Features ────────────────────────────────────────── */}
      <Section id="features" eyebrow="Built for trust" title="Everything you need to sell the smart way" sub="Real signals, scored continuously, acted on automatically — and written back where your team already works.">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-6 transition hover:border-white/15">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-accent/20 bg-accent/10 text-accent">
                <Icon name={f.icon} />
              </div>
              <h3 className="mt-4 font-display text-[16px] font-medium text-white">{f.title}</h3>
              <p className="mt-2 text-[13px] leading-relaxed text-white/50">{f.body}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* ── Testimonials ────────────────────────────────────── */}
      <Section eyebrow="Why teams switch" title="Selling the smart way">
        <div className="grid gap-4 md:grid-cols-3">
          {TESTIMONIALS.map((t) => (
            <figure key={t.name} className="flex flex-col rounded-2xl border border-white/[0.07] bg-white/[0.02] p-6">
              <div className="text-accent">{'★★★★★'}</div>
              <blockquote className="mt-3 flex-1 text-[13.5px] leading-relaxed text-white/70">“{t.quote}”</blockquote>
              <figcaption className="mt-5 text-[13px]"><span className="font-medium text-white/85">{t.name}</span><span className="text-white/40"> · {t.role}</span></figcaption>
            </figure>
          ))}
        </div>
      </Section>

      {/* ── FAQ ─────────────────────────────────────────────── */}
      <Section id="faq" eyebrow="Questions" title="Frequently asked">
        <div className="mx-auto max-w-2xl divide-y divide-white/[0.07] overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02]">
          {FAQ.map(([q, a]) => (
            <details key={q} className="group px-5">
              <summary className="flex cursor-pointer list-none items-center justify-between py-4 text-[14.5px] font-medium text-white/85 transition hover:text-white">
                {q}
                <span className="ml-4 text-accent transition-transform duration-200 group-open:rotate-45">+</span>
              </summary>
              <p className="pb-4 text-[13.5px] leading-relaxed text-white/55">{a}</p>
            </details>
          ))}
        </div>
      </Section>

      {/* ── Final CTA ───────────────────────────────────────── */}
      <section className="px-6 py-20">
        <div className="relative mx-auto max-w-4xl overflow-hidden rounded-3xl border border-accent/20 bg-accent/[0.06] px-8 py-14 text-center bg-grain">
          <div className="pointer-events-none absolute left-1/2 top-0 h-64 w-64 -translate-x-1/2 -translate-y-1/2 animate-breathe rounded-full bg-accent/20 blur-3xl" />
          <h2 className="relative font-display text-[30px] font-medium tracking-tight sm:text-[40px]">Let&apos;s turn traffic into pipeline.</h2>
          <p className="relative mx-auto mt-4 max-w-md text-[15px] text-white/55">Drop the snippet, connect a tool, and watch your target accounts light up.</p>
          <div className="relative mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link href="/signup" className="rounded-xl bg-accent px-6 py-3 text-sm font-semibold text-accent-foreground shadow-[0_12px_32px_-12px_rgba(197,251,80,0.6)] transition hover:bg-accent-hover">Start free →</Link>
            <Link href="/login" className="rounded-xl border border-white/15 bg-white/[0.04] px-6 py-3 text-sm font-medium text-white transition hover:bg-white/10">Log in</Link>
          </div>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────── */}
      <footer className="border-t border-white/[0.06]">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-8 text-[12.5px] text-white/35 sm:flex-row">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-accent" />
            <span className="font-display font-semibold text-white/60">ABM ENGINE</span>
            <span>— account-based GTM, one login</span>
          </div>
          <div className="flex items-center gap-5">
            <a href="#features" className="transition hover:text-white/70">Features</a>
            <a href="#faq" className="transition hover:text-white/70">FAQ</a>
            <Link href="/login" className="transition hover:text-white/70">Log in</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

function Section({ id, eyebrow, title, sub, children }: { id?: string; eyebrow: string; title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="mx-auto max-w-6xl scroll-mt-20 px-6 py-20">
      <div className="mb-10 max-w-2xl">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-accent/70">{eyebrow}</p>
        <h2 className="mt-3 font-display text-[28px] font-medium tracking-tight sm:text-[36px]">{title}</h2>
        {sub && <p className="mt-3 text-[15px] leading-relaxed text-white/50">{sub}</p>}
      </div>
      {children}
    </section>
  );
}

function Icon({ name }: { name: string }) {
  const common = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (name) {
    case 'radar': return <svg {...common}><path d="M19.07 4.93A10 10 0 1 0 21 12" /><path d="M12 12 16 8" /><circle cx="12" cy="12" r="4" /></svg>;
    case 'globe': return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" /></svg>;
    case 'gauge': return <svg {...common}><path d="M12 14 16 10" /><path d="M3.34 19a10 10 0 1 1 17.32 0" /></svg>;
    case 'sync': return <svg {...common}><path d="M21 2v6h-6M3 22v-6h6" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L21 8M3 16l2.64 2.36A9 9 0 0 0 20.49 15" /></svg>;
    case 'cpu': return <svg {...common}><rect x="6" y="6" width="12" height="12" rx="2" /><path d="M9 2v2M15 2v2M9 20v2M15 20v2M2 9h2M2 15h2M20 9h2M20 15h2" /></svg>;
    default: return <svg {...common}><path d="M13 2 3 14h7l-1 8 10-12h-7l1-8Z" /></svg>;
  }
}
