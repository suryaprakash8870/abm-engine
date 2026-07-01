/**
 * Re-source (clean-replace) every account that currently has contacts, for a
 * given login — fixes accounts that ended up with a mix of mock + real people
 * from being sourced twice. Re-sourcing is ~free (Prospeo dedups people already
 * pulled). Run AFTER the clean-replace fix is in place.
 *
 *   PROSPEO_API_KEY=... CONTACT_SOURCE=prospeo npx tsx scripts/resource-clean.ts [email]
 */
import 'dotenv/config';
import { prisma } from '../lib/db/client';
import { getAccountForSourcing, sourceAccountCommittee, listAccountsWithContacts } from '../lib/engines/contact-engine/service';
import { prospeoCreditsUsed } from '../lib/clients/prospeo';

async function main() {
  const email = process.argv[2];
  const wm = email
    ? await prisma.workspaceMember.findFirst({ where: { user: { email } }, select: { workspaceId: true } })
    : await prisma.workspaceMember.findFirst({ orderBy: { createdAt: 'asc' }, select: { workspaceId: true } });
  if (!wm) { console.log('No workspace found.'); return; }
  const workspaceId = wm.workspaceId;

  const withContacts = (await listAccountsWithContacts(workspaceId)).filter((a) => a.contact_count > 0);
  console.log(`Re-sourcing ${withContacts.length} account(s) with contacts (clean replace)…\n`);
  for (const a of withContacts) {
    const acct = await getAccountForSourcing(workspaceId, a.account_id);
    if (!acct) continue;
    const res = await sourceAccountCommittee(workspaceId, acct.accountId, acct.tier, acct.domain, acct.name);
    console.log(`  ${a.name}: ${res.contactsFound} contacts (${res.verifiedEmailCount} verified)`);
  }
  console.log(`\nDone. Prospeo credits used this run: ${prospeoCreditsUsed()}`);
  await prisma.$disconnect();
}
main().then(() => process.exit(0)).catch((e) => { console.error('ERR', e); process.exit(1); });
