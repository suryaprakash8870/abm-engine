import 'dotenv/config';
import { prisma } from '../lib/db/client';
import { seedDemoWorkspace } from '../lib/engines/demo-seed/seed';
import { scoreAndTierAccounts, type ScoringFormula } from '../lib/engines/scoring-engine/service';

const dist = (s: { tier: number | null }[]) => ({ t1: s.filter(x=>x.tier===1).length, t2: s.filter(x=>x.tier===2).length, t3: s.filter(x=>x.tier===3).length });

async function main() {
  // List all workspaces + their qualified counts so we can see the multi-ws state.
  const wss = await prisma.workspace.findMany({ select: { id: true } });
  for (const w of wss) {
    const q = await prisma.qualificationResult.count({ where: { workspaceId: w.id, qualified: true } });
    console.log(`workspace ${w.id}: ${q} qualified`);
  }
  const ws = wss[0]?.id; if (!ws) return;
  console.log('\nReseeding + scoring workspace', ws, '\n');
  await seedDemoWorkspace(ws);

  const f = await prisma.scoringFormula.findFirst({ where: { workspaceId: ws }, orderBy: { createdAt: 'desc' } });
  const quals = await prisma.qualificationResult.findMany({ where: { workspaceId: ws, qualified: true }, select: { accountId: true } });
  const enriched = await prisma.enrichedAccount.findMany({ where: { workspaceId: ws, accountId: { in: quals.map(q=>q.accountId) } }, select: { id: true } });
  const ids = enriched.map(e=>e.id);
  console.log('qualified accounts in this workspace:', ids.length);

  const KEYS = ['industry_fit','company_size','tech_stack','buying_signals'];
  const mk = (w: number[]): ScoringFormula => ({ id: f!.id, icp_id: f!.icpId, version: 1, is_fallback: false, tier_boundaries: f!.tierBoundaries as ScoringFormula['tier_boundaries'], criteria: KEYS.map((k,i)=>({key:k,label:k,weight:w[i],rationale:''})) });
  const A = await scoreAndTierAccounts(ws, ids, mk([0.7,0.1,0.1,0.1]));
  const B = await scoreAndTierAccounts(ws, ids, mk([0.1,0.1,0.1,0.7]));
  console.log('Industry-heavy:', dist(A));
  console.log('Signals-heavy :', dist(B));
}
main().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1)});
