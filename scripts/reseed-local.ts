/**
 * DUMMY / sample mode — rebuilds the full 210-account demo (all 11 engines) with
 * NO external API calls and NO credits. Instant and always works — the safe demo
 * fallback. Takes an optional [email] to target a specific login (default: oldest).
 *
 *   npx tsx scripts/reseed-local.ts [email]
 */
import 'dotenv/config';
import { prisma } from '../lib/db/client';
import { seedDemoWorkspace } from '../lib/engines/demo-seed/seed';

async function main() {
  const email = process.argv[2];
  const m = email
    ? await prisma.workspaceMember.findFirst({ where: { user: { email } }, select: { workspaceId: true } })
    : await prisma.workspaceMember.findFirst({ orderBy: { createdAt: 'asc' }, select: { workspaceId: true } });
  const ws = m?.workspaceId ?? (await prisma.scoringFormula.findFirst())?.workspaceId;
  if (!ws) { console.log(email ? `No workspace for ${email}.` : 'No workspace found.'); return; }
  console.log(`Reseeding ${email ?? 'oldest'} workspace to DUMMY (210-sample) mode…`);
  const s = await seedDemoWorkspace(ws);
  console.log('counts:', s.counts);
  await prisma.$disconnect();
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
