import 'dotenv/config';
import { prisma } from '../lib/db/client';
import { seedDemoWorkspace } from '../lib/engines/demo-seed/seed';
async function main() {
  const m = await prisma.workspaceMember.findFirst({ orderBy: { createdAt: 'asc' }, select: { workspaceId: true } });
  const ws = m?.workspaceId ?? (await prisma.scoringFormula.findFirst())?.workspaceId;
  if (!ws) { console.log('No workspace found.'); return; }
  console.log('Reseeding workspace', ws, '…');
  const s = await seedDemoWorkspace(ws);
  console.log('counts:', s.counts);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
