/**
 * scripts/capture-guide.ts — Playwright capture for /guide screenshots.
 *
 * For each of the 11 engines, this script:
 *   1. Signs up a throwaway user + seeds demo data (idempotent)
 *   2. Navigates to the engine's page, waits for it to render
 *   3. Locates each marker's target element via the selector in
 *      lib/guide/config.ts and injects a lime numbered badge centered on it
 *   4. Screenshots the viewport — markers are baked into the PNG
 *
 * No marker x/y guessing — positions come from real boundingClientRect.
 *
 * Run: npx tsx scripts/capture-guide.ts  (requires `npm run dev` on :3000)
 */

import { chromium, type Browser, type Page } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { GUIDE_ENGINES, type GuideEngine, type GuideMarker } from '../lib/guide/config';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const OUT_DIR = path.resolve('public', 'guide', 'screenshots');

const VIEWPORT = { width: 1440, height: 900 } as const;

interface PageTarget {
  engine: GuideEngine;
  url: string;
}

const TARGETS: PageTarget[] = GUIDE_ENGINES.map((e) => ({ engine: e, url: e.href }));

async function signupAndSeed(page: Page): Promise<void> {
  const ts = Date.now();
  const email = `capture-${ts}@guide.local`;
  const password = 'capture-pwd-12345';

  console.log(`  signup as ${email}`);
  const sup = await page.request.post(`${BASE}/api/v1/auth/signup`, {
    data: { email, password, full_name: 'Capture Bot' },
  });
  if (!sup.ok()) {
    throw new Error(`signup failed: ${sup.status()} ${await sup.text()}`);
  }
  console.log('  seeding demo data');
  const seed = await page.request.post(`${BASE}/api/v1/demo/seed`, {});
  if (!seed.ok()) {
    throw new Error(`seed failed: ${seed.status()} ${await seed.text()}`);
  }
  // Strip the TourBanner so it doesn't overlap the screenshot.
  await page.context().addInitScript(() => {
    try { window.localStorage.removeItem('abm_tour_step'); } catch { /* ignore */ }
  });
}

/** Inject a single lime numbered badge at `(cx, cy)` on the page. */
async function injectBadge(page: Page, n: number, cx: number, cy: number): Promise<void> {
  await page.evaluate(({ n, cx, cy }) => {
    const wrap = document.createElement('div');
    wrap.setAttribute('data-guide-badge', String(n));
    wrap.style.cssText = `
      position: fixed;
      left: ${cx}px;
      top: ${cy}px;
      transform: translate(-50%, -50%);
      z-index: 99999;
      pointer-events: none;
    `;

    // Outer glow
    const glow = document.createElement('div');
    glow.style.cssText = `
      position: absolute; inset: -8px;
      border-radius: 9999px;
      background: rgba(197, 251, 80, 0.35);
      filter: blur(6px);
    `;

    // Badge
    const badge = document.createElement('div');
    badge.textContent = String(n);
    badge.style.cssText = `
      position: relative;
      width: 30px; height: 30px;
      border-radius: 9999px;
      background: #c5fb50;
      color: #0a0e07;
      font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
      font-weight: 700;
      font-size: 14px;
      display: flex; align-items: center; justify-content: center;
      box-shadow:
        0 0 0 3px rgba(8, 9, 11, 0.92),
        0 0 14px 3px rgba(197, 251, 80, 0.7);
    `;
    wrap.appendChild(glow);
    wrap.appendChild(badge);
    document.body.appendChild(wrap);
  }, { n, cx, cy });
}

/** Locate marker target, scroll into view, return its center (viewport coords). */
async function locateAndCenter(page: Page, marker: GuideMarker): Promise<{ cx: number; cy: number } | null> {
  try {
    const locator = page.locator(marker.selector).first();
    const count = await locator.count();
    if (count === 0) return null;
    // Don't scroll — markers should reflect the viewport the screenshot captures.
    // If the element is below the fold, skip it (we'll log).
    const box = await locator.boundingBox();
    if (!box) return null;
    const cx = box.x + box.width / 2 + (marker.offset?.x ?? 0);
    const cy = box.y + box.height / 2 + (marker.offset?.y ?? 0);
    // Reject elements outside the viewport — badge would render off-screen.
    if (cx < 0 || cx > VIEWPORT.width || cy < 0 || cy > VIEWPORT.height) return null;
    return { cx, cy };
  } catch {
    return null;
  }
}

async function capture(page: Page, target: PageTarget): Promise<void> {
  const { engine: e, url } = target;
  process.stdout.write(`  [${e.num}] ${url} → `);

  await page.goto(`${BASE}${url}`, { waitUntil: 'networkidle', timeout: 30_000 });
  // Wait for the page-level "Loading…" placeholder to disappear.
  try {
    await page.waitForFunction(() => !document.body.innerText.includes('Loading'), { timeout: 8_000 });
  } catch { /* soft-fail */ }
  // Give animations a beat to settle.
  await page.waitForTimeout(600);
  // Always at top.
  await page.evaluate(() => window.scrollTo(0, 0));
  // Hide TourBanner if it sneaks in.
  await page.evaluate(() => {
    const b = document.querySelector('[role="region"][aria-label="Guided tour"]');
    if (b) (b as HTMLElement).style.display = 'none';
  });

  // Inject badges.
  const missed: number[] = [];
  for (const marker of e.markers) {
    const pos = await locateAndCenter(page, marker);
    if (!pos) {
      missed.push(marker.n);
      continue;
    }
    await injectBadge(page, marker.n, pos.cx, pos.cy);
  }

  const out = path.join(OUT_DIR, `${e.num}-${e.slug}.png`);
  await page.screenshot({ path: out, fullPage: false });
  const placed = e.markers.length - missed.length;
  const status = missed.length
    ? `${placed}/${e.markers.length} markers placed (skipped ${missed.join(',')})`
    : `${placed}/${e.markers.length} markers placed`;
  console.log(`saved ${path.relative(process.cwd(), out)} · ${status}`);
}

async function main(): Promise<void> {
  await mkdir(OUT_DIR, { recursive: true });
  console.log(`Capturing → ${OUT_DIR}`);
  let browser: Browser | undefined;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: VIEWPORT,
      deviceScaleFactor: 1,
      colorScheme: 'dark',
    });
    const page = await context.newPage();

    await signupAndSeed(page);

    for (const t of TARGETS) {
      try {
        await capture(page, t);
      } catch (err) {
        console.error(`  [${t.engine.num}] FAILED:`, err instanceof Error ? err.message : err);
      }
    }
    await context.close();
  } finally {
    if (browser) await browser.close();
  }
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
