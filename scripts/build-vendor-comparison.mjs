/**
 * Builds docs/VENDOR_COMPARISON.docx — third-party tool comparison + cost summary.
 * Prices verified live on 2026-06-11 (see Sources). Re-run research before
 * re-using numbers: per CLAUDE.md these prices shift frequently.
 *
 * Run: node scripts/build-vendor-comparison.mjs
 */
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, ShadingType, BorderStyle,
} from 'docx';
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const h1 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(t)] });
const h2 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(t)] });
const p = (t, opts = {}) =>
  new Paragraph({ spacing: { after: 160 }, children: [new TextRun({ text: t, ...opts })] });
const bullet = (t) =>
  new Paragraph({ bullet: { level: 0 }, spacing: { after: 80 }, children: [new TextRun(t)] });
const small = (t) =>
  new Paragraph({ spacing: { after: 160 }, children: [new TextRun({ text: t, size: 16, color: '666666' })] });

const BORDER = { style: BorderStyle.SINGLE, size: 2, color: 'CCCCCC' };
const CELL_BORDERS = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };

function cell(text, { header = false, width } = {}) {
  return new TableCell({
    borders: CELL_BORDERS,
    shading: header ? { type: ShadingType.CLEAR, fill: 'F3F4F6' } : undefined,
    width: width ? { size: width, type: WidthType.PERCENTAGE } : undefined,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    children: [
      new Paragraph({
        children: [new TextRun({ text, bold: header, size: 18 })],
      }),
    ],
  });
}

function table(headerRow, rows, widths) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        tableHeader: true,
        children: headerRow.map((t, i) => cell(t, { header: true, width: widths?.[i] })),
      }),
      ...rows.map(
        (r) => new TableRow({ children: r.map((t, i) => cell(String(t), { width: widths?.[i] })) }),
      ),
    ],
  });
}

const gap = () => new Paragraph({ spacing: { after: 200 }, children: [] });

const children = [
  new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun('ABM Engine — Third-Party Tools: Comparison & Cost Summary')] }),
  p('Every external tool and API the ABM Engine uses or plans to use, with alternatives, live-verified pricing, and total cost scenarios.', { italics: true }),
  p('All prices verified on June 11, 2026 from official pricing pages (or clearly labeled as "reported" where vendors hide pricing behind sales calls). These prices change often — re-verify before committing any budget (this rule is written into the project’s CLAUDE.md).', { bold: true }),

  h1('1. What the product uses today (and what it costs now)'),
  p('The engine was deliberately built so that development costs $0. Every paid integration is "key-gated": the code is finished, and adding the API key in .env is the only step to activate it (ADR-014, ADR-022).'),
  table(
    ['Integration', 'Status in code', 'Env key', 'Cost today'],
    [
      ['HubSpot CRM', 'Live — sync, scoring write-back, tasks, contacts', 'HUBSPOT_SERVICE_KEY', '$0 (free CRM tier)'],
      ['Supabase (Postgres + Auth)', 'Live — DB, RLS, JWT auth', 'DATABASE_URL, SUPABASE_JWT_SECRET', '$0 (free tier, local Docker for dev)'],
      ['Redis (BullMQ queues)', 'Live — all background jobs', 'REDIS_URL', '$0 (local Docker)'],
      ['Enrichment (Apollo)', 'Code complete — mock provider active until key is set', 'APOLLO_API_KEY', '$0 (mock)'],
      ['TAM search (Apollo)', 'Code complete — returns clear 503 until key is set', 'APOLLO_API_KEY', '$0 (gated)'],
      ['Slack alerts', 'Live — per-org incoming webhook', 'set in /settings', '$0 (webhooks are free)'],
      ['Salesforce CRM', 'Implemented, untested — needs free Developer Edition org', 'SALESFORCE_INSTANCE_URL + TOKEN', '$0 (Dev Edition is free)'],
      ['Email outreach', 'Stub action in orchestrator — provider not chosen yet', '—', '$0'],
      ['Intent data (3rd-party)', 'Ingestion endpoint ready — provider not contracted', '—', '$0'],
      ['LinkedIn Ads', 'CSV audience export works today — API needs partner approval', '—', '$0'],
    ],
    [22, 38, 22, 18],
  ),
  gap(),

  h1('2. Enrichment & company data — the first real cost'),
  p('This is the single unavoidable paid line item (ADR-014). The engine needs two things: enrich a domain into firmographics/technographics, and search for lookalike companies (TAM).'),
  table(
    ['Vendor', 'Entry price (verified)', 'API access', 'Best for', 'Gotcha'],
    [
      ['Apollo.io', '$49–59/user/mo (Basic) … full API needs Organization: $119/user/mo annual, 3-seat min ≈ $357/mo', 'Both endpoints we use exist; full API access effectively requires Organization plan', 'All-in-one: enrichment + TAM search + contacts in one bill', 'Per-seat + 3-seat minimum; credits shared with UI and expire monthly; overage $0.20/credit'],
      ['People Data Labs', 'Company API: $100/mo = 1,000 companies ($0.10 each, down to ~$0.065 at volume)', 'Clean REST API, self-serve, no seats', 'Pure pay-per-record enrichment; perfect fallback/waterfall provider', 'Free tier obfuscates emails/phones — unusable for production'],
      ['Clearbit (now HubSpot Breeze)', 'Requires HubSpot subscription; credits ~$10 per 1,000', 'No standalone API anymore — HubSpot-locked', 'Only if the customer is already deep in HubSpot', 'Platform-locked; credits reset monthly, no rollover; conflicts with our CRM-agnostic rule'],
      ['Hunter.io', '$49/mo (2,000 credits) … $149/mo (10,000)', 'Same credit pool covers API; 15 req/s', 'Finding contact emails per company (complements, does not replace, company enrichment)', 'Contacts only — no firmographic enrichment'],
      ['Ocean.io', '$79/mo reported (annual-only); API from ~$299/mo tier', 'API gated to Professional+ tier', 'Lookalike company discovery', 'Annual contracts only; real pricing behind a sales call'],
      ['ZoomInfo', '~$15,000/yr entry (reported median contract ~$31,875/yr)', 'Enterprise sales only', 'Enterprise scale — not now', 'Annual-only, 3-seat min, auto-renew traps'],
    ],
    [14, 24, 20, 22, 20],
  ),
  gap(),
  p('Recommendation:', { bold: true }),
  bullet('Start with People Data Labs at $100/mo when the first customer needs live enrichment — no seats, no minimums, linear pricing, and it plugs straight into our provider interface.'),
  bullet('Move to Apollo Organization (≈ $357/mo) when TAM prospecting matters — it bundles company search + contacts + enrichment, making it cheaper per record at volume (~$0.02–0.07/company).'),
  bullet('Keep both behind the same EnrichmentProvider interface (already built) so switching or waterfalling is a config change.'),

  h1('3. Email outreach (1:Many plays) — Phase 4'),
  table(
    ['Vendor', 'Entry price (verified)', 'API + webhooks', 'Limits at entry', 'Gotcha'],
    [
      ['Smartlead', '$39/mo Base; API needs Pro: $94/mo ($78 annual)', 'API + webhooks from Pro', 'Pro: 90k emails/mo, 30k contacts, unlimited mailboxes', 'No API at all on the $39 plan'],
      ['Instantly', '$47/mo Growth; webhooks need Hypergrowth: $97/mo', 'API v2 from Growth; webhooks only from Hypergrowth', 'Growth: 5k emails but only 1,000 contacts', 'The 1,000-contact cap bites long before the send cap'],
      ['Lemlist', '$39/mo ($31 annual)', 'API on every plan', '5,000 emails/mo', 'Per-user pricing'],
      ['Reply.io', '~$49–59/user/mo (annual)', 'API available; per-plan gating unverified (pricing page blocks bots)', '1,000 contacts / 5,000 emails', 'Pricing partially opaque'],
    ],
    [14, 24, 24, 20, 18],
  ),
  gap(),
  p('Recommendation: Smartlead Pro (≈ $94/mo) when 1:Many launches — API + webhooks + 30k contacts in one tier, plus $29/mo white-label client workspaces that map cleanly to per-customer separation. Instantly only wins if you stay under 1,000 contacts and can poll instead of receiving webhooks.', { bold: true }),

  h1('4. Intent data (3rd-party signals) — defer until revenue'),
  table(
    ['Vendor', 'Price (reported — both hide pricing)', 'Delivery', 'Gotcha'],
    [
      ['Bombora Company Surge', '~$25,000–30,000/yr entry; $35–50k mid-tier (annual contract only)', 'Weekly SFTP/CSV drops; API at partner tiers; Snowflake/BigQuery', 'Weekly (not real-time) refresh at entry; operationalizing reported at $75k+/yr all-in'],
      ['G2 Buyer Intent', '~$10,000–40,000/yr add-on, requires G2 Professional+ profile (~$15k+ base)', 'Dashboard, CSV, API, CRM connectors', 'Must keep paying the base G2 subscription to keep the feed'],
    ],
    [18, 32, 26, 24],
  ),
  gap(),
  p('Recommendation: do not contract either yet. Our ingestion path (POST /api/signals with party=third) is already live and weights 3rd-party signals at one-tenth of 1st-party (ADR-009) — when a customer brings their own Bombora/G2 feed, relaying it in is a webhook, not a build. Revisit only when revenue covers a $25k/yr line item.', { bold: true }),

  h1('5. Ads platforms (Playbook Step 6)'),
  bullet('LinkedIn Marketing API: no public access — requires applying to the partner program (weeks to months, rejections common). The Development tier only allows editing 5 ad accounts, so a multi-customer SaaS needs a second "Standard tier" application.'),
  bullet('Our shipped path: Tier 1+2 audience CSV export → manual upload in Campaign Manager (up to 300,000 hashed records per list). Free, works today, no approval.'),
  bullet('HubSpot Ads: syncs via the customer’s existing HubSpot — no extra vendor cost; ad spend itself is the customer’s budget.'),

  h1('6. CRM — ours is free; watch the CUSTOMER’s edition'),
  table(
    ['CRM', 'Our dev cost', 'API limits', 'Customer-side warning'],
    [
      ['HubSpot', '$0 — free CRM includes API (private apps)', '100 req/10s, 250,000 req/day on Free/Starter', 'Daily cap is account-wide — prefer webhooks over polling at scale'],
      ['Salesforce', '$0 — Developer Edition, 15,000 calls/day', 'Production: 100,000+ calls/day (Enterprise)', 'Pro Suite ($100/u/mo) has NO API — a Salesforce customer must be on Enterprise ($175/u/mo) or higher to connect us at all'],
    ],
    [12, 26, 28, 34],
  ),
  gap(),

  h1('7. Infrastructure (hosting, DB, auth, Redis)'),
  table(
    ['Service', 'Free tier reality', 'Paid entry (verified)', 'Gotcha'],
    [
      ['Supabase (DB + auth)', '500 MB DB, 50k MAUs — but pauses after 1 week idle', 'Pro $25/mo (8 GB, backups, never pauses)', 'The idle pause makes Free look like an outage to customers'],
      ['Clerk (auth alt.)', '50,000 monthly retained users free', 'Pro $25/mo; B2B org features +$100/mo', 'Real B2B features cost $125/mo — Supabase Auth already covers us'],
      ['Vercel (frontend)', 'Hobby is non-commercial use only', 'Pro $20/user/mo', 'A commercial SaaS on Hobby violates fair use'],
      ['Railway (API+workers)', '$5 trial credit', 'Hobby $5/mo + usage ≈ $15–20/mo for API+worker+Redis', '$20/vCPU-mo punishes busy workers'],
      ['Fly.io (API+workers)', 'No free tier for new accounts', '2× 512 MB machines ≈ $6.64/mo', 'No managed Redis — pair with Upstash'],
      ['Upstash (Redis)', '500k commands/mo — BullMQ burns this in days', 'Fixed $10/mo (flat, BullMQ-safe)', 'Never run BullMQ on pay-per-command pricing'],
      ['Render (alt.)', 'Free Postgres self-deletes after 30 days', 'API $7 + worker $7 + Redis $10 = $24/mo', 'Free tier is demo-only'],
    ],
    [16, 24, 28, 32],
  ),
  gap(),

  h1('8. Cost summary — three scenarios'),
  h2('Scenario A — Today (development): $0/month'),
  p('Local Docker for Postgres + Redis, HubSpot free CRM with a service key, mock enrichment, Salesforce Developer Edition. Nothing to pay. This is the state the repo ships in.'),

  h2('Scenario B — First design-partner customer in production'),
  table(
    ['Line item', 'Choice', '$/month'],
    [
      ['Frontend hosting', 'Vercel Pro (1 seat)', '20'],
      ['Database + auth', 'Supabase Pro', '25'],
      ['API + worker + Redis', 'Railway (or Fly.io $6.64 + Upstash $10)', '~17'],
      ['CRM', 'Customer’s existing HubSpot free tier', '0'],
      ['Enrichment', 'Option 1: keep mock / HubSpot-properties only', '0'],
      ['', 'Option 2: People Data Labs (1,000 companies/mo)', '+100'],
      ['', 'Option 3: Apollo Organization (TAM + enrichment, 3 seats annual)', '+357'],
      ['TOTAL (no live data)', '', '≈ $62/mo  ($744/yr)'],
      ['TOTAL (with PDL)', '', '≈ $162/mo  ($1,944/yr)'],
      ['TOTAL (with Apollo Org)', '', '≈ $419/mo  ($5,028/yr)'],
    ],
    [30, 46, 24],
  ),
  gap(),

  h2('Scenario C — Phase 4 scale (2–5 customers, outreach live)'),
  table(
    ['Line item', 'Choice', '$/month'],
    [
      ['Infrastructure', 'Same as Scenario B (some headroom)', '~65'],
      ['Enrichment + TAM', 'Apollo Organization (3 seats, annual)', '357'],
      ['Email outreach', 'Smartlead Pro', '94'],
      ['Intent data', 'Deferred — Bombora ~$25k/yr only post-revenue', '0'],
      ['LinkedIn Ads', 'CSV export path (free); API pending partner approval', '0'],
      ['TOTAL', '', '≈ $516/mo  (~$6,200/yr)'],
    ],
    [28, 48, 24],
  ),
  gap(),
  p('Reading the numbers: the engine’s own compute is nearly free (~$62/mo). The real money is data (Apollo/PDL) and, much later, intent feeds (Bombora/G2 at $25k+/yr). The expensive items are exactly the ones our architecture key-gates — so each cost switches on only when a paying customer justifies it.', { bold: true }),

  h1('9. Decision summary'),
  table(
    ['Decision', 'Pick', 'When', 'Why'],
    [
      ['Enrichment v1', 'People Data Labs $100/mo', 'First customer needing live data', 'No seats, no minimum, linear pricing'],
      ['Enrichment + TAM at volume', 'Apollo Organization ~$357/mo', 'When TAM prospecting is in active use', 'Cheapest per record once bundled credits are used'],
      ['Outreach', 'Smartlead Pro $94/mo', 'Phase 4, first 1:Many play', 'API + webhooks + white-label workspaces per customer'],
      ['Intent data', 'None yet', 'Post-revenue only', '$25k+/yr annual contracts; ingestion path already built'],
      ['Auth', 'Supabase Auth (keep)', '—', 'Already in stack; Clerk adds $0–125/mo for no decisive benefit'],
      ['Hosting', 'Vercel Pro + Supabase Pro + Railway', 'First production deploy', '≈ $62/mo total, simplest ops'],
      ['Salesforce customers', 'Require Enterprise edition', 'Sales qualification question', 'Pro Suite has no API — cannot connect otherwise'],
    ],
    [22, 26, 24, 28],
  ),
  gap(),

  h1('10. Sources (accessed June 11, 2026)'),
  small('Apollo: apollo.io/pricing, docs.apollo.io/docs/api-pricing · Breeze/Clearbit: knowledge.hubspot.com (credits & billing) · People Data Labs: peopledatalabs.com/pricing + prospeo.io roundup · Hunter: hunter.io/pricing · Ocean.io: ocean.io/pricing (gated; reported via zoominfo/omr) · ZoomInfo: reported via cleanlist.ai/cognism/Vendr · Smartlead: smartlead.ai/pricing · Instantly: instantly.ai/pricing + help.instantly.ai (API v2) · Lemlist: lemlist.com/pricing · Bombora: reported via docket.io/Vendr/marketbetter · G2: reported via Vendr/prospeo + documentation.g2.com · LinkedIn: learn.microsoft.com Marketing API tiers + developer.linkedin.com · Slack: docs.slack.dev rate limits · Supabase: supabase.com/pricing · Clerk: clerk.com/pricing · Vercel: vercel.com/pricing · Railway: railway.com/pricing · Fly.io: fly.io/docs/about/pricing · Upstash: upstash.com/pricing + BullMQ integration doc · Render: render.com/pricing · HubSpot API: developers.hubspot.com usage guidelines · Salesforce: coupler.io API-limits reproduction + salesforce.com pricing update.'),
  small('Figures labeled "reported" come from third-party buyer data (Vendr, review roundups) because the vendor does not publish pricing. Treat every number here as a snapshot: re-verify before signing anything.'),
];

const doc = new Document({
  creator: 'OneGTMLab',
  title: 'ABM Engine — Third-Party Tools: Comparison & Cost Summary',
  sections: [{ children }],
});

const buf = await Packer.toBuffer(doc);
const out = join(ROOT, 'docs', 'VENDOR_COMPARISON.docx');
writeFileSync(out, buf);
console.log(`written ${out} (${Math.round(buf.length / 1024)} KB)`);
