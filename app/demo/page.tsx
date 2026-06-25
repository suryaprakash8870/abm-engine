/**
 * /demo — a scrollable, narrated walkthrough of the 11 engines. Pitched at a
 * teammate (or prospective user) who needs to see how the platform turns an
 * ICP into closed-won deals and then learns from the outcome.
 *
 * Structure:
 *   1. Hero — what the system is
 *   2. Pipeline diagram — 11 numbered nodes left→right with arrows
 *   3. Eleven engine cards — purpose, what you'll see, try-it CTA
 *   4. The loop closes — Engine 11 → Engine 01 callout
 *   5. Final CTA — start at the ICP Engine
 */

import Link from 'next/link';
import { SeedPanel } from './SeedPanel';
import { StartTour } from './StartTour';

interface Engine {
  num: string;
  slug: string;
  name: string;
  tagline: string;
  what: string;
  see: string;
  href: string;
  emits: string;
}

const ENGINES: Engine[] = [
  {
    num: '01',
    slug: 'icp',
    name: 'ICP Engine',
    tagline: 'Profile the ideal customer.',
    what: 'Answer 12 questions in a guided wizard. Claude synthesises an Ideal Customer Profile with explicit firmographics, technographics, exclusion rules, and confidence per criterion.',
    see: 'A wizard, then an ICP card with criteria + weights you can tune.',
    href: '/icp',
    emits: 'icp.created',
  },
  {
    num: '02',
    slug: 'tam',
    name: 'TAM Builder',
    tagline: 'Source every matching company.',
    what: 'On the ICP event, sources companies that match — through Apollo or a CSV import. Hands off a clean account list to enrichment.',
    see: 'A job page that streams accounts in as they are found.',
    href: '/tam/upload',
    emits: 'tam.build_completed',
  },
  {
    num: '03',
    slug: 'enrichment',
    name: 'Enrichment Engine',
    tagline: 'AI-qualify each account.',
    what: 'Enriches each company with Apollo / Clearbit, caches results in a shared enrichment_cache, then runs a Claude qualification pass to mark each account qualified or not.',
    see: 'Per-account enrichment + a qualified / unqualified badge.',
    href: '/icp',
    emits: 'accounts.enriched',
  },
  {
    num: '04',
    slug: 'scoring',
    name: 'Scoring Engine',
    tagline: 'Fit score + tier per account.',
    what: 'Applies your ICP rubric — explicit weights per criterion — and produces a 0–100 fit score plus a Tier 1/2/3 assignment. You can override any tier with a reason; overrides survive re-scoring.',
    see: 'A table of scored accounts with score bars and tier pills.',
    href: '/scoring',
    emits: 'account.score_updated',
  },
  {
    num: '05',
    slug: 'tal',
    name: 'TAL Manager',
    tagline: 'Build + maintain the target list.',
    what: 'Cuts a versioned Target Account List from Tier 1 + Tier 2 accounts. Atomic finalize: one TAL version, fanned out to contacts and CRM-sync.',
    see: 'Target Account List with re-finalize + suppress controls.',
    href: '/tal',
    emits: 'tal.finalized',
  },
  {
    num: '06',
    slug: 'contacts',
    name: 'Contact Engine',
    tagline: 'Map the buying committee.',
    what: 'Sources contacts from each Tier 1/2 account and maps them to the 3 roles that close deals: Decision Maker, Champion, Influencer.',
    see: 'A 3-column stakeholder map per account — drag to re-assign.',
    href: '/contacts',
    emits: 'contacts.sourced',
  },
  {
    num: '07',
    slug: 'signals',
    name: 'Signal Engine',
    tagline: 'Track buying signals — always on.',
    what: 'Captures first-party signals (pricing-page visits, demo clicks, product usage) from a website snippet and CRM webhooks. Dedupes, scores, and emits per-signal events.',
    see: 'The tracking snippet to paste + a live signal feed.',
    href: '/signals',
    emits: 'signal.captured',
  },
  {
    num: '08',
    slug: 'awareness',
    name: 'Awareness Engine',
    tagline: 'Score awareness + route hot accounts.',
    what: 'Combines signals into a 0–100 awareness score, maps that to a 5-stage funnel (Identified → Aware → Interested → Considering → Selecting), and routes hot accounts via your rules.',
    see: 'Hot-accounts feed + routing rules with score thresholds.',
    href: '/awareness',
    emits: 'account.stage_changed',
  },
  {
    num: '09',
    slug: 'plays',
    name: 'Demand Gen Orchestrator',
    tagline: 'Run the right play at the right time.',
    what: 'Picks a play from the tier × stage matrix (with late-stage hot escalation), atomically checks suppression, and fires it once. Drafts AI emails on demand.',
    see: 'A plays log with status + outcome + AI-draft preview.',
    href: '/plays',
    emits: 'play.fired',
  },
  {
    num: '10',
    slug: 'crm',
    name: 'CRM Sync Engine',
    tagline: 'Write everything back.',
    what: 'The only engine that writes to your CRM. Encrypted tokens, idempotent batches, verified webhooks. Closed-won/lost deals flow back through here too.',
    see: 'Integrations page with the HubSpot connector + sync log.',
    href: '/integrations',
    emits: 'crm.synced',
  },
  {
    num: '11',
    slug: 'flywheel',
    name: 'GTM Flywheel',
    tagline: 'Learn from every deal.',
    what: 'Multi-touch attribution per closed deal, win-rate by tier, signal correlation (gated below 20 data points), and — every 5th win — fires icp.refresh_recommended back to Engine 01.',
    see: 'Pipeline by tier, attribution timelines, ICP refresh callouts.',
    href: '/insights',
    emits: 'icp.refresh_recommended',
  },
];

function PipelineDiagram() {
  return (
    <div className="relative">
      {/* Faint connecting line behind the chips */}
      <div className="absolute left-0 right-0 top-1/2 h-px -translate-y-1/2 bg-gradient-to-r from-transparent via-white/15 to-transparent" />
      <ol className="relative grid grid-cols-11 gap-1">
        {ENGINES.map((e, i) => (
          <li key={e.num} className="flex flex-col items-center gap-2">
            <a
              href={`#engine-${e.num}`}
              className="group relative flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-canvas font-mono text-[11px] font-medium text-white/65 transition hover:border-accent/60 hover:text-accent"
            >
              <span
                className="absolute inset-0 -z-10 rounded-full opacity-0 transition group-hover:opacity-100"
                style={{
                  background:
                    'radial-gradient(circle, rgba(197,251,80,0.45), transparent 70%)',
                  filter: 'blur(8px)',
                }}
              />
              {e.num}
            </a>
            <span className="hidden text-center text-[10px] uppercase tracking-wider text-white/35 md:block">
              {e.name.replace(' Engine', '').replace(' Manager', '').replace('Demand Gen ', '').replace(' Sync', '')}
            </span>
            {/* Arrow to next, except last */}
            {i < ENGINES.length - 1 && (
              <span aria-hidden className="absolute top-5 left-full hidden -translate-y-1/2 text-white/15 lg:inline">
                →
              </span>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

export default function DemoPage() {
  // cache-bust comment v2
  return (
    <div className="space-y-12">
      {/* Hero */}
      <header className="animate-rise space-y-5">
        <p className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[10.5px] font-medium uppercase tracking-[0.18em] text-white/55">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_8px_2px_rgba(197,251,80,0.6)]" />
          Walkthrough · 11 engines
        </p>
        <h1 className="font-display text-[40px] font-medium leading-[1.05] tracking-tight text-white sm:text-[52px]">
          From an idea of your buyer
          <br />
          to a system that learns from every deal.
        </h1>
        <p className="max-w-2xl text-[15px] leading-relaxed text-white/55">
          Eleven engines, each owning one job. Click <span className="text-accent">Load demo data</span> to populate them all, then <span className="text-accent">Start the guided tour</span> — a banner at the bottom of every page tells you what you&rsquo;re looking at and where to click next.
        </p>
      </header>

      {/* Load demo data panel */}
      <SeedPanel />

      {/* Pipeline diagram */}
      <section className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-6 md:p-8">
        <p className="mb-5 text-[10.5px] font-medium uppercase tracking-[0.18em] text-white/35">
          The pipeline · left → right
        </p>
        <PipelineDiagram />
      </section>

      {/* Start guided tour */}
      <StartTour />

      {/* The loop closes */}
      <section className="relative overflow-hidden rounded-2xl border border-accent/20 bg-gradient-to-br from-accent/[0.06] via-transparent to-transparent p-8 md:p-10">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-20 -right-20 h-[360px] w-[360px] rounded-full"
          style={{
            background:
              'radial-gradient(circle, rgba(197,251,80,0.32), transparent 70%)',
            filter: 'blur(60px)',
          }}
        />
        <p className="mb-3 text-[10.5px] font-medium uppercase tracking-[0.18em] text-accent">
          The wow moment
        </p>
        <h2 className="font-display text-[28px] font-medium leading-tight tracking-tight text-white sm:text-[34px]">
          Engine 11 closes the loop back to Engine 01.
        </h2>
        <p className="mt-4 max-w-2xl text-[14.5px] leading-relaxed text-white/65">
          Every fifth closed-won deal, the GTM Flywheel fires{' '}
          <code className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[12.5px] text-white/85">
            icp.refresh_recommended
          </code>{' '}
          — and the ICP Engine consumes it. The customers you actually close become the next version of your ICP. The system stops being a static rubric and starts learning from your wins.
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-2 font-mono text-[12px] text-white/55">
          <span className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-1">11 · GTM Flywheel</span>
          <span className="text-accent">→</span>
          <span className="rounded-md bg-accent/[0.10] px-2 py-1 text-accent">icp.refresh_recommended</span>
          <span className="text-accent">→</span>
          <span className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-1">01 · ICP Engine</span>
        </div>
      </section>

      {/* Final CTA */}
      <section className="flex flex-col items-start gap-4 border-t border-white/[0.07] pt-10 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-display text-[22px] font-medium text-white">Ready to run it?</p>
          <p className="text-sm text-white/50">Start at the ICP Engine — every other engine wakes up from there.</p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/icp"
            className="inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-3 text-[14px] font-semibold text-accent-foreground shadow-[0_18px_36px_-18px_rgba(197,251,80,0.7)] transition hover:bg-accent-hover"
          >
            Start at Engine 01
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M13 5l7 7-7 7" />
            </svg>
          </Link>
          <Link
            href="/insights"
            className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/[0.04] px-5 py-3 text-[14px] font-medium text-white/85 transition hover:bg-white/[0.08]"
          >
            See the flywheel
          </Link>
        </div>
      </section>
    </div>
  );
}
