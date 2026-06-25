/**
 * Guide content — the "how to use the platform" documentation. Each engine
 * gets a rich entry: short intro, numbered manual steps, screenshot path,
 * marker positions, and a "behind the scenes" explanation. Used by /guide.
 *
 * Markers are positioned at capture time by the Playwright script
 * (scripts/capture-guide.ts), which locates each `selector` and bakes a lime
 * numbered badge into the PNG. /guide just displays the PNG + the labels list.
 */

export interface GuideMarker {
  /** Marker number shown on the screenshot (1-based). */
  n: number;
  /** Playwright selector for the UI element this marker points at. */
  selector: string;
  /** Short caption shown below the screenshot in the labels list. */
  label: string;
  /** Optional pixel offset from the element center (e.g. {x: 0, y: -10}). */
  offset?: { x: number; y: number };
}

export interface GuideEngine {
  num: string;        // '01' .. '11'
  slug: string;       // 'icp', 'tam', 'enrichment', ...
  name: string;
  href: string;       // live app page
  hook: string;       // one-line intro
  intro: string;      // paragraph explaining the page
  steps: string[];    // numbered "what to do" actions
  markers: GuideMarker[];
  behind: string;     // "what's happening behind the scenes"
  screenshot: string; // /guide/screenshots/NN-slug.png
}

export const GUIDE_ENGINES: GuideEngine[] = [
  {
    num: '01',
    slug: 'icp',
    name: 'ICP Engine',
    href: '/icp',
    hook: 'The source of truth for every other engine.',
    intro: 'Your Ideal Customer Profile defines who you are selling to. Every other engine reads from it: TAM uses it to search, Enrichment to qualify, Scoring to weight criteria.',
    steps: [
      'Open /icp — your active ICP loads automatically (one per workspace).',
      'Skim Firmographics — industries, headcount range, geographies, revenue bands.',
      'Check Technographics — what tools must they have, what disqualifies them.',
      'Note the confidence score — 0.82 means the ICP is well-supported.',
    ],
    markers: [
      { n: 1, selector: 'h1', label: 'Page title' },
      { n: 2, selector: 'text=FIRMOGRAPHICS >> nth=0', label: 'Firmographics card — industry + size + geography filters' },
      { n: 3, selector: 'text=TECHNOGRAPHICS >> nth=0', label: 'Technographics — required tools (HubSpot here)' },
      { n: 4, selector: 'text=Overall confidence', label: 'Confidence score — 0-1 quality of the ICP' },
    ],
    behind: 'Stored as IcpDefinition + IcpVersion. Engine 03 keeps a local snapshot so qualification needs no cross-engine query. Updates fire icp.updated to every consumer.',
    screenshot: '/guide/screenshots/01-icp.png',
  },
  {
    num: '02',
    slug: 'tam',
    name: 'TAM Builder',
    href: '/tal',
    hook: '210 companies sourced from your ICP filters.',
    intro: 'TAM Builder reads the ICP, translates it into search filters, and pages through Apollo until it has every matching company. Deduped by domain so you never see the same company twice.',
    steps: [
      'Open /tal — the Target Account List displays all sourced accounts.',
      'Notice 210 total accounts loaded by demo data.',
      'Each row shows company, domain, tier, and score.',
      'Filter by tier using the chips above the table.',
    ],
    markers: [
      { n: 1, selector: 'h1', label: 'Page title — Target Account List' },
      { n: 2, selector: 'text=/\\d+ accounts/', label: 'Account count pill' },
      { n: 3, selector: 'button:has-text("Re-finalize")', label: 'Re-finalize — cuts a new TAL version atomically' },
      { n: 4, selector: 'tbody tr:nth-child(1) td:nth-child(1)', label: 'First company in the sourced list' },
    ],
    behind: 'Engine 02 stores results in raw_account_list (workspaceId, domain) unique. Hands off to Engine 03 via tam.build_completed.',
    screenshot: '/guide/screenshots/02-tam.png',
  },
  {
    num: '03',
    slug: 'enrichment',
    name: 'Enrichment Engine',
    href: '/tal',
    hook: 'AI-qualifies each company against your ICP.',
    intro: 'Each raw account gets enriched (industry, headcount, tech stack, funding stage) and then Claude reads the rubric to verdict it qualified or out. Results cached for 90 days to control cost.',
    steps: [
      'Open /tal — every account on the list is already enriched.',
      'Each row shows enriched fields: industry, headcount, tech.',
      'Notice the qualification result — qualified accounts make the TAL.',
      'Click any company to drill into its full enrichment data.',
    ],
    markers: [
      { n: 1, selector: 'tbody tr:nth-child(1) td:nth-child(1)', label: 'Enriched company name (industry from Apollo)' },
      { n: 2, selector: 'tbody tr:nth-child(1) td:nth-child(3)', label: 'Tier pill — Claude qualified this account' },
      { n: 3, selector: 'tbody tr:nth-child(1) td:nth-child(4)', label: 'Score — derived from enriched attributes' },
    ],
    behind: 'enrichment_cache (no workspaceId) keeps public company data shared across workspaces. Qualification stored in qualification_results (qualified, confidence, reason).',
    screenshot: '/guide/screenshots/03-enrichment.png',
  },
  {
    num: '04',
    slug: 'scoring',
    name: 'Scoring Engine',
    href: '/scoring',
    hook: 'Every qualified account gets 0-100 fit + a tier.',
    intro: 'Scoring applies a weighted rubric (criteria × weights) to each enriched account, producing a 0-100 fit score and a tier (1/2/3). Weights must sum to 1.0. Manual tier overrides survive re-scoring.',
    steps: [
      'Open /scoring — your formula loads with criteria + weights.',
      'Adjust weight sliders — they must sum to 1.0 (shown in the top-right).',
      'Click "Save formula" then "Run scoring now" to re-score all accounts.',
      'Click "View scored accounts →" to see results — try Override on any row.',
    ],
    markers: [
      { n: 1, selector: 'h1', label: 'Page title — Scoring Formula' },
      { n: 2, selector: 'text=Criteria & Weights', label: 'Criteria + weight sliders' },
      { n: 3, selector: 'a:has-text("View scored accounts")', label: 'View scored accounts → see the tier override UI' },
      { n: 4, selector: 'text=/Total: /', label: 'Total must equal 1.00 to save — weights are normalised' },
    ],
    behind: 'ScoringFormula + AccountScore + TierOverride. Overrides win over re-scoring (override is sticky until cleared).',
    screenshot: '/guide/screenshots/04-scoring.png',
  },
  {
    num: '05',
    slug: 'tal',
    name: 'TAL Manager',
    href: '/tal',
    hook: 'The official Target Account List — versioned + suppressible.',
    intro: 'The TAL is the curated list sales pursues — only Tier 1 and Tier 2. Each finalize cuts an immutable version. Suppression list keeps existing customers and closed-lost off the TAL.',
    steps: [
      'Open /tal — see all Tier 1 + Tier 2 accounts.',
      'Click "Re-finalize" — cuts TAL v2 atomically (one row, fan-out to contacts + CRM).',
      'On any account row, click "Suppress" → pick a reason → it leaves the TAL.',
      'Export as CSV using the link in the header.',
    ],
    markers: [
      { n: 1, selector: 'a:has-text("Export CSV")', label: 'Export CSV — for offline sharing' },
      { n: 2, selector: 'button:has-text("Re-finalize")', label: 'Re-finalize — cuts a new TAL version' },
      { n: 3, selector: 'tbody tr:nth-child(1) button:has-text("Suppress")', label: 'Suppress — remove an account with a reason' },
      { n: 4, selector: 'button:has-text("Tier 1") >> nth=0', label: 'Tier filter chips' },
    ],
    behind: 'TargetAccountList (one head per workspace) + TalAccount (current membership) + TalVersion (immutable history) + SuppressionEntry. Engine 10 syncs the TAL to HubSpot as a list/property.',
    screenshot: '/guide/screenshots/05-tal.png',
  },
  {
    num: '06',
    slug: 'contacts',
    name: 'Contact Engine',
    href: '/contacts',
    hook: 'Maps the buying committee — DM, Champion, Influencer.',
    intro: 'For every Tier 1/Tier 2 account, Engine 06 sources contacts and asks Claude to classify each as Decision Maker, Champion, or Influencer.',
    steps: [
      'Open /contacts — see TAL accounts with contact counts.',
      'Click "View map →" on any account.',
      'See contacts in three columns: DM / Champion / Influencer.',
      'Drag a contact card between columns to re-assign their role.',
    ],
    markers: [
      { n: 1, selector: 'h1', label: 'Page title — Buying Committees' },
      { n: 2, selector: 'button:has-text("Source all Tier 1")', label: 'Source all Tier 1 — batch-fetch contacts' },
      { n: 3, selector: 'a:has-text("View map") >> nth=0', label: 'View map → drill into stakeholder layout' },
      { n: 4, selector: 'tbody tr:nth-child(1) td:nth-child(3)', label: 'Contact count badge per account' },
    ],
    behind: 'Engine 06 sources from Apollo, verifies emails (valid/risky/invalid), and Claude classifies stakeholderRole. StakeholderMap stores the DM/Champion/Influencer arrays.',
    screenshot: '/guide/screenshots/06-contacts.png',
  },
  {
    num: '07',
    slug: 'signals',
    name: 'Signal Engine',
    href: '/signals',
    hook: 'Always-on buying-intent tracker.',
    intro: 'Captures website visits, CRM webhooks, and email opens. Resolves each signal back to a TAL account, dedupes within 5-minute buckets, scores points based on signal type.',
    steps: [
      'Open /signals — see your tracking snippet at the top.',
      'Copy the snippet and paste it before </head> on your website.',
      'Click "Test snippet" to fire a synthetic signal.',
      'Watch the live signal feed below — newest first.',
    ],
    markers: [
      { n: 1, selector: 'code', label: 'Your unique tracking snippet — paste on your site' },
      { n: 2, selector: 'button:has-text("Copy")', label: 'Copy snippet to clipboard' },
      { n: 3, selector: 'button:has-text("Test snippet")', label: 'Test snippet — fires a synthetic signal' },
      { n: 4, selector: 'text=Live signal feed', label: 'Live signal stream — most recent first' },
    ],
    behind: 'Signal table is workspace-scoped with @@unique([workspaceId, dedupKey]) for idempotency. Sources: website, crm_webhook, email_webhook.',
    screenshot: '/guide/screenshots/07-signals.png',
  },
  {
    num: '08',
    slug: 'awareness',
    name: 'Awareness Engine',
    href: '/awareness',
    hook: 'Signals become a 0-100 score + a 5-stage funnel.',
    intro: 'Awareness sums recent signal points (with time-decay), caps the score at 100, and maps it to a stage: Identified → Aware → Interested → Considering → Selecting. Routing rules fire when accounts cross thresholds.',
    steps: [
      'Open /awareness — see all accounts ranked by score.',
      'Note the stage pill on each row (color-coded by funnel position).',
      'Look at the 7d change — green ▲ means heating up.',
      'Scroll to "Signal routing rules" — add a rule like "Score ≥ 80 → SDR alert".',
    ],
    markers: [
      { n: 1, selector: 'tbody tr:nth-child(1) td:nth-child(2)', label: 'Awareness score bar 0-100 (capped)' },
      { n: 2, selector: 'tbody tr:nth-child(1) td:nth-child(3)', label: 'Stage pill — 5-stage funnel position' },
      { n: 3, selector: 'tbody tr:nth-child(1) td:nth-child(4)', label: '7d change — heating up / cooling off' },
      { n: 4, selector: 'tbody tr:nth-child(1) td:nth-child(5)', label: 'Recent signals — what is driving the score' },
    ],
    behind: 'AwarenessScore (one per account) + ScoreSnapshot (daily) + RoutingRule + StageChangeLog. Decay runs daily at 00:00 UTC via a BullMQ repeatable.',
    screenshot: '/guide/screenshots/08-awareness.png',
  },
  {
    num: '09',
    slug: 'plays',
    name: 'Demand Gen Orchestrator',
    href: '/plays',
    hook: 'Picks the right play; AI writes the email.',
    intro: 'When an account heats up, Engine 09 reads the tier × stage matrix to pick a play, checks suppression atomically (no double-firing), then fires CRM task + Slack alert + sequence enrollment. Claude drafts the email on demand.',
    steps: [
      'Open /plays — see plays that fired for hot accounts.',
      'Click "Draft" on any row — Claude generates 3 subject lines + body.',
      'Pick the best subject, copy the body, send via your CRM.',
      'Click "Contacted" or "Not interested" to record the outcome.',
    ],
    markers: [
      { n: 1, selector: 'h1', label: 'Page title — Plays' },
      { n: 2, selector: 'button:has-text("Draft") >> nth=0', label: 'Draft — opens AI-generated email panel' },
      { n: 3, selector: 'button:has-text("Contacted") >> nth=0', label: 'Mark Contacted — records play outcome' },
      { n: 4, selector: 'button:has-text("Snooze") >> nth=0', label: 'Snooze — defers replay by 7d' },
    ],
    behind: 'PlaysLog with @@unique([workspaceId, accountId, correlationId]) for idempotency. Suppression uses Postgres advisory_xact_lock so two concurrent triggers can never fire twice.',
    screenshot: '/guide/screenshots/09-plays.png',
  },
  {
    num: '10',
    slug: 'crm',
    name: 'CRM Sync Engine',
    href: '/integrations',
    hook: 'The only engine that talks to your CRM.',
    intro: 'Every other engine writes through here. Encrypted OAuth tokens (AES-256-GCM), idempotent batches (100/batch), signature-verified webhooks. Closed-won/lost deals flow back through here to Engine 11.',
    steps: [
      'Open /integrations — see HubSpot connection status.',
      'Click "Connect HubSpot" — kicks off OAuth flow (already connected in demo).',
      'Scroll to the CRM Sync Log — every account/contact/play write logged.',
      'Look for outcome pills: success / failed / dead_lettered.',
    ],
    markers: [
      { n: 1, selector: 'text=HubSpot >> nth=0', label: 'HubSpot connector card' },
      { n: 2, selector: 'button:has-text("Disconnect"), button:has-text("Connect HubSpot")', label: 'Connect / Disconnect — OAuth flow' },
      { n: 3, selector: 'text=CRM Sync Log', label: 'Sync log — every CRM write audited' },
      { n: 4, selector: 'tbody tr:nth-child(1) td:nth-child(3)', label: 'Outcome pill — success / failed / dead_lettered' },
    ],
    behind: 'CrmConnection (encrypted tokens), SyncJob (one per source event, idempotent via correlationId), SyncLog (one per record). WebhookSubscription gates inbound deal events.',
    screenshot: '/guide/screenshots/10-crm.png',
  },
  {
    num: '11',
    slug: 'flywheel',
    name: 'GTM Flywheel',
    href: '/insights',
    hook: 'The loop closes — every 5th won deal refreshes your ICP.',
    intro: 'On every closed-won/lost deal, Engine 11 walks back the timeline (signals + plays), calculates multi-touch attribution, recomputes pipeline/win-rate by tier. Every 5th win fires icp.refresh_recommended back to Engine 01.',
    steps: [
      'Open /insights — see pipeline + win-rate + avg deal size + days-to-close per tier.',
      'Look at the attribution timelines — which touches led to each closed deal.',
      'Signal correlation data appears once you have ≥20 closed deals.',
      'Watch the worker logs for icp.refresh_recommended after the 5th win.',
    ],
    markers: [
      { n: 1, selector: 'h1', label: 'Page title — Insights' },
      { n: 2, selector: 'text=PIPELINE (WON)', label: 'Pipeline by tier — Tier 1 dominates revenue' },
      { n: 3, selector: 'text=WIN RATE', label: 'Win rate per tier' },
      { n: 4, selector: 'text=Signal correlation', label: 'Signal correlation — needs ≥20 deals to display' },
    ],
    behind: 'PipelineSnapshot (daily) + AttributionEvent (per touch) + WinLossAnalysis + FlywheelMetric + SignalCorrelationData. claimIcpRefreshMilestone uses advisory_xact_lock + watermark band to fire icp.refresh_recommended exactly once per 5-band.',
    screenshot: '/guide/screenshots/11-flywheel.png',
  },
];
