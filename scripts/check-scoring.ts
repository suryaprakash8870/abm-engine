/**
 * Local diagnostic: does scoring respond to weight changes against YOUR local DB?
 *
 * Run:  npx tsx scripts/check-scoring.ts
 *
 * It scores the seeded accounts directly (no worker / no UI) with two opposite
 * weight sets and prints the tier distribution for each — so we can tell whether
 * the ENGINE works locally, independent of the worker/UI.
 */
import 'dotenv/config';
import { prisma } from '../lib/db/client';
import { scoreAndTierAccounts, type ScoringFormula } from '../lib/engines/scoring-engine/service';

const dist = (s: { tier: number | null }[]) => ({
  t1: s.filter((x) => x.tier === 1).length,
  t2: s.filter((x) => x.tier === 2).length,
  t3: s.filter((x) => x.tier === 3).length,
  none: s.filter((x) => x.tier === null).length,
});

async function main() {
  const f = await prisma.scoringFormula.findFirst({ orderBy: { createdAt: 'desc' } });
  if (!f) {
    console.log('No scoring formula found. Seed demo data first (/demo → Load demo data).');
    return;
  }
  const { workspaceId, icpId } = f;
  const dbKeys = (f.criteria as Array<{ key: string }>).map((c) => c.key);
  console.log('DB formula criterion keys:', dbKeys);
  console.log(
    dbKeys.includes('industry_fit')
      ? '✓ New keys present — local DB has the fixed seed.\n'
      : '✗ OLD keys — your local DB was seeded BEFORE the fix. Re-run "Load demo data".\n',
  );

  const quals = await prisma.qualificationResult.findMany({ where: { workspaceId, qualified: true }, select: { accountId: true } });
  const enriched = await prisma.enrichedAccount.findMany({ where: { workspaceId, accountId: { in: quals.map((q) => q.accountId) } }, select: { id: true } });
  const ids = enriched.map((e) => e.id);
  console.log(`Scoring ${ids.length} qualified accounts.\n`);

  const KEYS = ['industry_fit', 'company_size', 'tech_stack', 'buying_signals'];
  const mk = (ws: number[]): ScoringFormula => ({
    id: f.id,
    icp_id: icpId,
    version: 1,
    is_fallback: false,
    tier_boundaries: f.tierBoundaries as ScoringFormula['tier_boundaries'],
    criteria: KEYS.map((k, i) => ({ key: k, label: k, weight: ws[i], rationale: '' })),
  });

  const A = await scoreAndTierAccounts(workspaceId, ids, mk([0.7, 0.1, 0.1, 0.1]));
  const B = await scoreAndTierAccounts(workspaceId, ids, mk([0.1, 0.1, 0.1, 0.7]));
  console.log('Industry-heavy [70/10/10/10]:', dist(A));
  console.log('Signals-heavy  [10/10/10/70]:', dist(B));
  console.log(
    JSON.stringify(dist(A)) !== JSON.stringify(dist(B))
      ? '\n✓ ENGINE WORKS LOCALLY — the distribution changes with weights.\n  If the UI stays stuck, your worker isn’t processing: restart `npm run worker`.'
      : '\n✗ Distribution did NOT change. Your ICP firmographics likely lack employee_min/employee_max,\n  or accounts lack industry/tech data — re-seed demo data with the latest code.',
  );
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
