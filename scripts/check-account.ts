import 'dotenv/config';
import { prisma } from '../lib/db/client';

async function main() {
  const email = process.argv[2] ?? 'prospeo@gmail.com';
  const wm = await prisma.workspaceMember.findFirst({ where: { user: { email } }, select: { workspaceId: true } });
  if (!wm) { console.log(`No workspace for ${email}.`); return; }
  const ws = wm.workspaceId;

  const tal = await prisma.talAccount.findMany({ where: { workspaceId: ws }, select: { accountId: true, name: true, domain: true, tier: true }, orderBy: { score: 'desc' } });
  console.log(`${email}: ${tal.length} accounts on the target list`);
  console.log('  top companies:', tal.slice(0, 6).map((t) => t.name).join(', '));

  const counts = await prisma.contact.groupBy({ by: ['accountId'], where: { workspaceId: ws }, _count: { accountId: true } });
  const countMap = new Map(counts.map((c) => [c.accountId, c._count.accountId]));
  const withContacts = tal.filter((t) => (countMap.get(t.accountId) ?? 0) > 0);
  console.log(`  ${withContacts.length} account(s) have contacts:`);
  for (const t of withContacts) {
    const cs = await prisma.contact.findMany({ where: { workspaceId: ws, accountId: t.accountId }, select: { fullName: true, title: true, email: true } });
    console.log(`   • ${t.name} (${cs.length}): ${cs.map((c) => c.fullName).join(', ')}`);
  }
  await prisma.$disconnect();
}
main().then(() => process.exit(0)).catch((e) => { console.error('ERR', e); process.exit(1); });
