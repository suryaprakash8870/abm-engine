/**
 * Tour config — the 11 engines + the page each one corresponds to + a
 * one-line "what to try" hint for the user while they're on that page.
 *
 * The tour is a manual product walk-through: the user clicks **Next** on the
 * banner after exploring the real page, and the tour navigates them to the
 * next engine. Same data model as the on-page Walkthrough, but lives at the
 * page level instead of as a self-contained slide deck.
 */

export interface TourStep {
  /** 1-based step number. */
  step: number;
  /** Engine number as displayed (zero-padded). */
  num: string;
  /** Engine name. */
  name: string;
  /** The page this step takes the user to. */
  href: string;
  /** Short headline shown on the banner. */
  headline: string;
  /** Imperative hint: what should the user try on this page? */
  hint: string;
}

export const TOUR_STEPS: TourStep[] = [
  {
    step: 1,
    num: '01',
    name: 'ICP Engine',
    href: '/icp',
    headline: 'This is your Ideal Customer Profile.',
    hint: 'Industries, headcount, tech-stack, exclusions — every engine downstream reads from this. Skim it, then click Next.',
  },
  {
    step: 2,
    num: '02',
    name: 'TAM Builder',
    href: '/tal',
    headline: 'These 10 companies were sourced from your ICP.',
    hint: 'Apollo found every match for your filters. The table below is the raw account list from Engine 02.',
  },
  {
    step: 3,
    num: '03',
    name: 'Enrichment Engine',
    href: '/tal',
    headline: 'Each account is enriched + AI-qualified.',
    hint: 'Industry, headcount, tech-stack added by Apollo + Clearbit. Claude verdicts each one qualified / out.',
  },
  {
    step: 4,
    num: '04',
    name: 'Scoring Engine',
    href: '/scoring',
    headline: 'Every account gets a fit score and a tier.',
    hint: 'Try clicking View scored accounts → on the right. Then on any row click Override to manually re-tier — overrides survive re-scoring.',
  },
  {
    step: 5,
    num: '05',
    name: 'TAL Manager',
    href: '/tal',
    headline: 'The official Target Account List — Tier 1 + Tier 2 only.',
    hint: 'Click Re-finalize to cut a new versioned TAL. Suppress any account to remove it from the list.',
  },
  {
    step: 6,
    num: '06',
    name: 'Contact Engine',
    href: '/contacts',
    headline: 'Three contacts per Tier 1/2 account: DM, Champion, Influencer.',
    hint: 'Click View map → on any account to see the buying-committee layout. You can drag contacts to re-assign roles.',
  },
  {
    step: 7,
    num: '07',
    name: 'Signal Engine',
    href: '/signals',
    headline: '34 signals captured — pricing visits, demo clicks, case studies.',
    hint: 'Copy your tracking snippet and paste it on your site. Or hit Test snippet to fire one yourself.',
  },
  {
    step: 8,
    num: '08',
    name: 'Awareness Engine',
    href: '/awareness',
    headline: '10 accounts scored 0-100, placed in a 5-stage funnel.',
    hint: 'Cobalt + Vertex are at 100 (selecting). Add a routing rule below to alert sales when accounts cross a score threshold.',
  },
  {
    step: 9,
    num: '09',
    name: 'Demand Gen Orchestrator',
    href: '/plays',
    headline: '4 plays fired for hot accounts — AI drafts ready.',
    hint: 'Click Draft on any row to see Claude’s 3 subject lines and email body. Mark a play Contacted to record outcome.',
  },
  {
    step: 10,
    num: '10',
    name: 'CRM Sync Engine',
    href: '/integrations',
    headline: 'HubSpot connected · everything writes through here.',
    hint: '19 sync entries below — every account, contact, and play upserted to HubSpot. The only engine that touches your CRM.',
  },
  {
    step: 11,
    num: '11',
    name: 'GTM Flywheel',
    href: '/insights',
    headline: 'The loop closes here — every 5th deal refreshes your ICP.',
    hint: 'Pipeline by tier, multi-touch attribution per deal, signal correlations. This is where the system learns from your wins.',
  },
];

export const TOUR_TOTAL = TOUR_STEPS.length;
