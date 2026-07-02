/**
 * Wipe a workspace back to empty (no ICP, no TAM, no accounts/contacts/etc.) so
 * the demo can start fresh from the ICP wizard. Same reset reseed-real uses, but
 * without repopulating.
 *
 *   npx tsx scripts/clear-account.ts <email>
 */
import 'dotenv/config';
import { prisma } from '../lib/db/client';
import { resetDemoWorkspace } from '../lib/engines/demo-seed/seed';

async function main() {
  const email = process.argv[2];
  if (!email) { console.log('Usage: npx tsx scripts/clear-account.ts <email>'); return; }
  const wm = await prisma.workspaceMember.findFirst({ where: { user: { email } }, select: { workspaceId: true } });
  if (!wm) { console.log(`No workspace for ${email}.`); return; }
  await resetDemoWorkspace(wm.workspaceId);
  console.log(`✅ Cleared ${email} — empty workspace, no ICP. Fresh for the demo.`);
  await prisma.$disconnect();
}
main().then(() => process.exit(0)).catch((e) => { console.error('ERR', e); process.exit(1); });
