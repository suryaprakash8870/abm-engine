/**
 * Builds docs/USER_GUIDE.docx from the screenshots in docs/screenshots.
 * Run AFTER capture-guide-screenshots.mjs:  node scripts/build-user-guide.mjs
 */
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, ImageRun, AlignmentType,
} from 'docx';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = join(ROOT, 'docs', 'screenshots');

/** Read PNG pixel size from the IHDR chunk so images keep their aspect ratio. */
function pngSize(buf) {
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

const PAGE_IMG_WIDTH = 600; // px inside the doc

function img(file) {
  const buf = readFileSync(join(SHOTS, file));
  const { width, height } = pngSize(buf);
  const h = Math.round((PAGE_IMG_WIDTH / width) * height);
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [
      new ImageRun({ data: buf, transformation: { width: PAGE_IMG_WIDTH, height: h } }),
    ],
  });
}

const h1 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(t)] });
const h2 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(t)] });
const p = (t, opts = {}) =>
  new Paragraph({
    spacing: { after: 160 },
    children: [new TextRun({ text: t, ...opts })],
  });
const bullet = (t) =>
  new Paragraph({ bullet: { level: 0 }, spacing: { after: 80 }, children: [new TextRun(t)] });
const code = (t) =>
  new Paragraph({
    spacing: { after: 160 },
    children: [new TextRun({ text: t, font: 'Consolas', size: 18 })],
  });

const children = [
  new Paragraph({
    heading: HeadingLevel.TITLE,
    children: [new TextRun('ABM Engine — User Guide')],
  }),
  p('A simple guide to every screen in the app. ABM Engine connects to your CRM (HubSpot today), scores your target accounts, watches their buying signals, and tells you the right moment to reach out.', { italics: true }),
  p('Last updated: June 11, 2026.'),

  h1('1. Getting started'),
  p('Start the app with these three steps (each in its own terminal):'),
  code('docker compose up -d          (starts the database and queue)'),
  code('cd apps/api  &&  npm run start:dev          (starts the API on port 4000)'),
  code('cd apps/web  &&  npm run dev                (starts the website on port 3000)'),
  p('Then open http://localhost:3000 in your browser.'),
  p('If pages look broken (plain text, no colors): stop the web server, delete the apps/web/.next folder, and start it again. If all numbers show zero: make sure Docker and the API are running.'),

  h1('2. Sign in'),
  img('01-login.png'),
  p('Create an account with your email and a password. Your first sign-in automatically creates your organization — there is no extra setup step.'),
  p('Developer note: if Supabase is not configured yet, the app runs in “dev mode” and you can use every page without signing in.'),

  h1('3. Dashboard — the engine at a glance'),
  img('02-dashboard.png'),
  p('The dashboard answers one question: “where do my target accounts stand right now?”'),
  bullet('Total accounts — how many companies the engine is tracking.'),
  bullet('Tiers — how good a fit each account is. Tier 1 = best fit (green), Tier 2 = good (orange), Tier 3 = okay (gray).'),
  bullet('Avg fit score — the average fit across all accounts (0–100).'),
  bullet('Tier distribution — the same tiers as a donut chart.'),
  bullet('Awareness funnel — how “warm” accounts are, from Identified (cold) to Selecting (actively choosing a vendor). Accounts move up when they show buying signals.'),
  bullet('Validation gate — proof that the awareness score predicts real revenue. It stays “Pending data” until your CRM has enough closed-won deals to measure. Until it passes, keep automation rules off.'),

  h1('4. Accounts — your target list'),
  img('03-accounts.png'),
  p('Every company the engine tracks, best fits first. Use the search box to filter by name or domain.'),
  bullet('Fit — how well the company matches your ideal customer profile (0–100).'),
  bullet('Tier — the fit translated into a simple 1 / 2 / 3 label.'),
  bullet('Signal — how much buying activity the company showed recently. Old activity counts less every day (it “decays”).'),
  bullet('Stage — where the account sits in the awareness funnel (Identified → Aware → Engaged → Considering → Selecting).'),
  bullet('Sync from HubSpot — pulls your companies from HubSpot, scores them, enriches missing data, imports their contacts, and writes the scores back into HubSpot. All automatic.'),
  bullet('Seed dummy data — fills the app with 30 sample companies so you can try everything safely.'),

  h1('5. Account detail — why this score?'),
  img('04-account-detail.png'),
  p('Click any account to see the full story. The app never shows a bare number — every score comes with its reasons.'),
  bullet('How this score was computed — each row shows a fact about the company (industry, size, country…), the points it earned, and why.'),
  bullet('Stakeholders — the people at this company from your CRM, labeled by buying role: Decision Maker, Champion, or Influencer. Roles are detected from job titles and written back to your CRM.'),
  bullet('Recent signals — every buying signal with its weight and date. First-party signals (their visit to YOUR website, a demo request) count about ten times more than third-party hints.'),

  h1('6. ICP Lab — learn from your wins'),
  img('05-icp-lab.png'),
  p('Upload a CSV of your past customers and the lab finds what they have in common — top industries, company sizes, countries — then builds scoring rules from those patterns and scores a list of new prospects against them.'),
  p('Already connected to HubSpot? The API can do the same analysis straight from your closed deals (including average deal size and sales-cycle length): GET /api/icp/analyze-from-crm.'),

  h1('7. ICP Rubric — tune the scoring'),
  img('06-rubric.png'),
  p('The rubric is the recipe behind every fit score: which industries, company sizes, and countries earn points, and where the tier cut-offs sit.'),
  bullet('Edit the JSON and press “Save as new version”. Every account is re-scored immediately.'),
  bullet('Saving never deletes the old recipe — each save creates a new version, so you can always see what changed.'),
  bullet('Optional: add a "technologies" section (for example {"HubSpot": 10}) to give points to companies that use specific tools.'),

  h1('8. TAM — find companies beyond your CRM'),
  img('07-tam.png'),
  p('Your CRM only knows the companies you already met. TAM search finds new companies that look like your best customers (via Apollo), imports them, and scores them with the same rubric.'),
  bullet('Needs an Apollo API key (paid plan). Without it the page explains exactly what to configure — nothing is hidden.'),
  bullet('Download audience CSV exports your Tier 1 + Tier 2 companies, ready to upload as an ad audience in LinkedIn or HubSpot Ads.'),

  h1('9. Settings'),
  img('08-settings.png'),
  bullet('Organization — rename your workspace.'),
  bullet('Slack alerts — paste a Slack webhook URL and the engine can ping your channel when a hot account fires a signal (used by automation rules).'),
  bullet('CRM connection — shows which CRM is connected and how.'),
  bullet('Recurring sync — let the engine re-sync and re-score your CRM automatically (default: every 15 minutes). Enable it once and forget it.'),
  bullet('Enrichment — shows which data provider fills in missing company info. “mock” is the free built-in test provider; add an Apollo key to switch to live data.'),

  h1('10. Sending signals into the engine'),
  p('Signals are how the engine knows an account is warming up. Your website tracker, email tool, or any script can send one:'),
  code('POST http://localhost:4000/api/signals'),
  code('{ "domain": "acme.com", "type": "pricing_page_visit", "party": "first" }'),
  bullet('party "first" = they interacted with YOU (website visit, demo request, email reply). Worth the most.'),
  bullet('party "second" = social/ads engagement (LinkedIn, events). Worth less.'),
  bullet('party "third" = outside hints (hiring news, intent data). Worth the least.'),
  p('Weights are fixed on the server, so no one can inflate their own importance. The full weight table is at GET /api/signals/config.'),

  h1('11. Automation rules (Phase 3 — off by default)'),
  p('Rules turn scores into action: “if signal score is over 50, alert Slack and create a CRM task.” Create them via the API at /api/rules.'),
  p('Important: rules are created switched OFF, and the engine ships with none. Turn a rule on only after the validation gate on the dashboard says “Passed” — an unproven score should not drive automation.'),

  h1('12. Quick troubleshooting'),
  bullet('Page is unstyled / plain text → restart the web server with a fresh .next folder.'),
  bullet('Everything shows 0 → Docker or the API is not running.'),
  bullet('Validation gate says “Pending data” → normal until your CRM has at least 5 closed-won deals matched to tracked accounts.'),
  bullet('TAM search says it needs a key → set APOLLO_API_KEY in the API .env (paid Apollo plan).'),
  bullet('Stakeholders empty → contacts import runs after a HubSpot sync, not after seeding dummy data.'),
];

const doc = new Document({
  creator: 'OneGTMLab',
  title: 'ABM Engine — User Guide',
  sections: [{ children }],
});

const buf = await Packer.toBuffer(doc);
const out = join(ROOT, 'docs', 'USER_GUIDE.docx');
writeFileSync(out, buf);
console.log(`written ${out} (${Math.round(buf.length / 1024)} KB)`);
