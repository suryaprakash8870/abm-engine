/**
 * Captures the screenshots used in docs/USER_GUIDE.docx.
 *
 * Prereqs: docker compose up, API on :4000, web dev server on :3000,
 * seeded data (POST /api/dev/seed/accounts) so pages aren't empty.
 *
 * Run: node scripts/capture-guide-screenshots.mjs
 * Uses your installed Edge via playwright-core — no browser download.
 */
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'docs', 'screenshots');
const WEB = 'http://localhost:3000';
const API = 'http://localhost:4000';
const ORG = '00000000-0000-0000-0000-000000000001';

mkdirSync(OUT, { recursive: true });

// Resolve a real account id so the detail page has data.
const accountsRes = await fetch(`${API}/api/accounts`, { headers: { 'x-org-id': ORG } });
const { accounts } = await accountsRes.json();
const detailId = accounts.find((a) => (a.signalScore ?? 0) > 0)?.id ?? accounts[0].id;

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
  colorScheme: 'light',
});

const shots = [
  ['01-login', `${WEB}/auth/login`],
  ['02-dashboard', `${WEB}/dashboard`],
  ['03-accounts', `${WEB}/accounts`],
  ['04-account-detail', `${WEB}/accounts/${detailId}`],
  ['05-icp-lab', `${WEB}/icp`],
  ['06-rubric', `${WEB}/icp/rubric`],
  ['07-tam', `${WEB}/accounts/tam`],
  ['08-settings', `${WEB}/settings`],
];

for (const [name, url] of shots) {
  await page.goto(url, { waitUntil: 'networkidle' });
  // Let TanStack Query render fetched data after network settles.
  await page.waitForTimeout(1200);
  await page.screenshot({ path: join(OUT, `${name}.png`), fullPage: true });
  console.log(`captured ${name}`);
}

await browser.close();
console.log(`done → ${OUT}`);
