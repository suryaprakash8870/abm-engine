import 'dotenv/config';
import { prisma } from '../lib/db/client';

async function main() {
  // 1) Prospeo remaining credits (free call).
  try {
    const res = await fetch('https://api.prospeo.io/account-information', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-KEY': process.env.PROSPEO_API_KEY ?? '' },
      body: '{}',
    });
    const j = (await res.json()) as Record<string, unknown>;
    console.log('PROSPEO account-information:', JSON.stringify(j).slice(0, 600));
  } catch (e) {
    console.log('Prospeo balance check error:', String(e));
  }

  // 2) What contacts does Elastic actually have now for prospeo@gmail.com?
  const wm = await prisma.workspaceMember.findFirst({ where: { user: { email: 'prospeo@gmail.com' } }, select: { workspaceId: true } });
  if (wm) {
    const tal = await prisma.talAccount.findFirst({ where: { workspaceId: wm.workspaceId, name: { contains: 'lastic' } }, select: { accountId: true, name: true } });
    if (tal) {
      const contacts = await prisma.contact.findMany({ where: { workspaceId: wm.workspaceId, accountId: tal.accountId }, select: { fullName: true, title: true, email: true } });
      console.log(`\n${tal.name} — ${contacts.length} contacts in DB:`);
      for (const c of contacts) console.log(`  • ${c.fullName} — ${c.title} <${c.email}>`);
    } else {
      console.log('\nElastic TAL account not found.');
    }
  }
  await prisma.$disconnect();
}
main().then(() => process.exit(0)).catch((e) => { console.error('ERR', e); process.exit(1); });
