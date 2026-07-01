/**
 * Remove mock/dummy contacts (from the Apollo mock generator's name pool) for a
 * login, keeping real ones. Fixes accounts that ended up with a mock+real mix.
 * Then rebuilds each affected account's stakeholder map.
 *
 *   npx tsx scripts/remove-mock-contacts.ts [email]
 */
import 'dotenv/config';
import { prisma } from '../lib/db/client';

// The mock generator (lib/clients/apollo.ts) draws from these fixed pools.
const FIRST = new Set(['ava', 'liam', 'maya', 'noah', 'priya', 'ethan', 'sofia', 'omar', 'lena', 'raj', 'clara', 'theo']);
const LAST = new Set(['reyes', 'okafor', 'nguyen', 'patel', 'mendez', 'cohen', 'haddad', 'larsson', 'iyer', 'fischer', 'santos', 'walsh']);

function isMock(fullName: string | null): boolean {
  if (!fullName) return false;
  const parts = fullName.trim().toLowerCase().split(/\s+/);
  if (parts.length < 2) return false;
  return FIRST.has(parts[0]) && LAST.has(parts.slice(1).join(' '));
}

async function main() {
  const email = process.argv[2] ?? 'prospeo@gmail.com';
  const wm = await prisma.workspaceMember.findFirst({ where: { user: { email } }, select: { workspaceId: true } });
  if (!wm) { console.log(`No workspace for ${email}.`); return; }
  const workspaceId = wm.workspaceId;

  const all = await prisma.contact.findMany({ where: { workspaceId }, select: { id: true, accountId: true, fullName: true } });
  const mock = all.filter((c) => isMock(c.fullName));
  const mockIds = mock.map((m) => m.id);
  if (mockIds.length === 0) { console.log('No mock contacts found — nothing to remove.'); await prisma.$disconnect(); return; }

  const affectedAccounts = [...new Set(mock.map((m) => m.accountId))];
  await prisma.$transaction([
    prisma.emailVerificationResult.deleteMany({ where: { workspaceId, contactId: { in: mockIds } } }),
    prisma.contactCrmSyncLog.deleteMany({ where: { workspaceId, contactId: { in: mockIds } } }),
    prisma.contact.deleteMany({ where: { workspaceId, id: { in: mockIds } } }),
  ]);
  console.log(`Removed ${mockIds.length} mock contact(s): ${mock.map((m) => m.fullName).join(', ')}`);

  // Rebuild the stakeholder map for each affected account from what's left (real).
  for (const accountId of affectedAccounts) {
    const remaining = await prisma.contact.findMany({ where: { workspaceId, accountId }, select: { id: true, stakeholderRole: true } });
    const byRole = (r: string) => remaining.filter((c) => c.stakeholderRole === r).map((c) => c.id);
    await prisma.stakeholderMap.upsert({
      where: { workspaceId_accountId: { workspaceId, accountId } },
      create: { workspaceId, accountId, dmContactIds: byRole('decision_maker'), championContactIds: byRole('champion'), influencerContactIds: byRole('influencer') },
      update: { dmContactIds: byRole('decision_maker'), championContactIds: byRole('champion'), influencerContactIds: byRole('influencer') },
    });
  }
  console.log(`Rebuilt stakeholder maps for ${affectedAccounts.length} account(s). Real contacts kept.`);
  await prisma.$disconnect();
}
main().then(() => process.exit(0)).catch((e) => { console.error('ERR', e); process.exit(1); });
