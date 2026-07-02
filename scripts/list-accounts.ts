import 'dotenv/config';
import { prisma } from '../lib/db/client';

async function main() {
  const members = await prisma.workspaceMember.findMany({
    select: { workspaceId: true, createdAt: true, user: { select: { email: true } } },
    orderBy: { createdAt: 'asc' },
  });
  console.log(`${members.length} account(s):\n`);
  for (const m of members) {
    const ws = m.workspaceId;
    const [icp, tal, contacts] = await Promise.all([
      prisma.icpDefinition.count({ where: { workspaceId: ws } }),
      prisma.talAccount.count({ where: { workspaceId: ws } }),
      prisma.contact.count({ where: { workspaceId: ws } }),
    ]);
    const state = icp === 0 ? 'EMPTY (no ICP)' : `${tal} target accounts, ${contacts} contacts`;
    console.log(`  ${(m.user?.email ?? '—').padEnd(30)} ${state}`);
  }
  await prisma.$disconnect();
}
main().then(() => process.exit(0)).catch((e) => { console.error('ERR', e); process.exit(1); });
