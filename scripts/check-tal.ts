import { prisma } from '@/lib/db/client';

(async () => {
  const tal = await prisma.talAccount.findMany({
    select: { workspaceId: true, accountId: true, name: true, tier: true },
    take: 5,
    orderBy: { tier: 'asc' },
  });
  console.log('TAL accounts:', tal.length);
  console.table(tal);
  await prisma.$disconnect();
})().catch((e) => { console.error(e.message); process.exit(1); });
