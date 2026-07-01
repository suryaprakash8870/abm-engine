import 'dotenv/config';
import { prisma } from '../lib/db/client';

async function main() {
  // List every workspace with its owner email + how much demo data it holds,
  // so we know which one to reseed for the demo.
  const members = await prisma.workspaceMember.findMany({
    orderBy: { createdAt: 'asc' },
    select: { workspaceId: true, createdAt: true, user: { select: { email: true } } },
  });

  const rows: Array<Record<string, unknown>> = [];
  for (const m of members) {
    const wsId = m.workspaceId;
    const [accounts, scored, deals, icpVersions, overrides, suppressions, playOutcomes] = await Promise.all([
      prisma.enrichedAccount.count({ where: { workspaceId: wsId } }),
      prisma.accountScore.count({ where: { workspaceId: wsId } }),
      prisma.winLossAnalysis.count({ where: { workspaceId: wsId } }),
      prisma.icpVersion.count({ where: { icp: { workspaceId: wsId } } }).catch(() => -1),
      prisma.tierOverride.count({ where: { workspaceId: wsId } }),
      prisma.suppressionEntry.count({ where: { workspaceId: wsId } }),
      prisma.playOutcome.count({ where: { workspaceId: wsId } }),
    ]);
    rows.push({
      email: m.user?.email ?? '(no user)',
      wsId,
      created: m.createdAt.toISOString().slice(0, 10),
      accounts, scored, deals, icpVersions, overrides, suppressions, playOutcomes,
    });
  }
  // Show workspaces that actually contain demo data first.
  rows.sort((a, b) => (b.accounts as number) - (a.accounts as number));
  for (const r of rows) console.log(JSON.stringify(r));
  await prisma.$disconnect();
}

main().catch((e) => { console.error('ERR', e); process.exit(1); });
