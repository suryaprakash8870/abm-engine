import 'dotenv/config';
import { prisma } from '../lib/db/client';

async function main() {
  // The new account is the one holding the staffing-firm accounts.
  const ta = await prisma.talAccount.findFirst({
    where: { domain: { in: ['bayone.com', 'optomi.com', 'scrum.org', 'prudentconsulting.com'] } },
    select: { workspaceId: true, domain: true },
    orderBy: { addedAt: 'desc' },
  });
  if (!ta) { console.log('Could not find the new account by its companies.'); return; }
  const wm = await prisma.workspaceMember.findFirst({ where: { workspaceId: ta.workspaceId }, select: { user: { select: { email: true } } } });
  console.log('NEW_ACCOUNT_EMAIL:', wm?.user?.email ?? '(unknown)');
  console.log('workspace:', ta.workspaceId, '| matched on', ta.domain);
  await prisma.$disconnect();
}
main().then(() => process.exit(0)).catch((e) => { console.error('ERR', e); process.exit(1); });
