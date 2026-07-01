/**
 * Add a REAL company to the demo target list and source its buying committee via
 * Prospeo, so you can SEE real contacts in the Contacts page (the 210 sample
 * accounts have fake domains and won't return real people).
 *
 *   PROSPEO_API_KEY=... CONTACT_SOURCE=prospeo \
 *     npx tsx scripts/add-real-account.ts intercom.com "Intercom"
 *
 * Idempotent per domain. Re-sourcing a company you've pulled before is free
 * (Prospeo's 30/90-day dedup). Then: open the app → Contacts → the company.
 */
import 'dotenv/config';
import { prisma } from '../lib/db/client';
import { sourceAccountCommittee } from '../lib/engines/contact-engine/service';
import { shouldUseProspeo, prospeoCreditsUsed } from '../lib/clients/prospeo';

async function main() {
  const domain = (process.argv[2] ?? 'intercom.com').trim().toLowerCase();
  const name = process.argv[3] ?? domain.split('.')[0].replace(/^./, (c) => c.toUpperCase());

  if (!shouldUseProspeo()) {
    console.log('Prospeo is not enabled. Add to .env:  CONTACT_SOURCE=prospeo  and  PROSPEO_API_KEY=...');
    return;
  }

  const m = await prisma.workspaceMember.findFirst({ orderBy: { createdAt: 'asc' }, select: { workspaceId: true } });
  if (!m) { console.log('No workspace found.'); return; }
  const workspaceId = m.workspaceId;
  const tal = await prisma.targetAccountList.findFirst({ where: { workspaceId }, select: { id: true } });
  if (!tal) { console.log('No target list yet — finalize the TAL first.'); return; }

  const accountId = `real_${domain.replace(/[^a-z0-9]/gi, '_')}`;
  await prisma.talAccount.upsert({
    where: { talId_accountId: { talId: tal.id, accountId } },
    create: { workspaceId, talId: tal.id, accountId, domain, name, tier: 1, score: 92 },
    update: { domain, name, tier: 1, score: 92 },
  });
  console.log(`Added ${name} (${domain}) to the target list as Tier 1. Sourcing its committee via Prospeo…\n`);

  const res = await sourceAccountCommittee(workspaceId, accountId, 1, domain, name);
  const contacts = await prisma.contact.findMany({
    where: { workspaceId, accountId },
    select: { fullName: true, title: true, email: true, stakeholderRole: true },
    orderBy: { roleConfidence: 'desc' },
  });
  for (const c of contacts) console.log(`  • [${c.stakeholderRole}] ${c.fullName} — ${c.title}  <${c.email}>`);
  console.log(`\nContacts: ${res.contactsFound}   Credits used this run: ${prospeoCreditsUsed()}`);
  console.log(`\n➡  View it: open the app → Contacts → ${name}  (or /contacts/${accountId})`);
  await prisma.$disconnect();
}
main().then(() => process.exit(0)).catch((e) => { console.error('ERR', e); process.exit(1); });
