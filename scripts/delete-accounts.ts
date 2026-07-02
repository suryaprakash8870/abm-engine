/**
 * Delete every account EXCEPT the keep-list. Permanent. Guarded:
 *   - aborts if any keep-list email is missing (protects against a typo nuking all)
 *   - never deletes a workspace a kept account belongs to
 * For each deleted user: wipe workspace data → delete workspace → delete user.
 *
 *   npx tsx scripts/delete-accounts.ts
 */
import 'dotenv/config';
import { prisma } from '../lib/db/client';
import { resetDemoWorkspace } from '../lib/engines/demo-seed/seed';

const KEEP = ['suryasakthi8870@gmail.com', 'abm@gmail.com', 'onegtmlab@gmail.com'];

async function main() {
  const users = await prisma.user.findMany({
    select: { id: true, email: true, membership: { select: { workspaceId: true } } },
  });

  const existing = new Set(users.map((u) => u.email));
  const missing = KEEP.filter((e) => !existing.has(e));
  if (missing.length) { console.log(`ABORT — keep-list email(s) not found: ${missing.join(', ')}`); return; }

  const keepWorkspaces = new Set(
    users.filter((u) => KEEP.includes(u.email)).flatMap((u) => u.membership.map((m) => m.workspaceId)),
  );
  const toDelete = users.filter((u) => !KEEP.includes(u.email));
  console.log(`Keeping ${KEEP.length} accounts. Deleting ${toDelete.length}…\n`);

  for (const u of toDelete) {
    for (const m of u.membership) {
      if (keepWorkspaces.has(m.workspaceId)) continue; // shared with a kept account — leave it
      await resetDemoWorkspace(m.workspaceId);
      await prisma.workspace.delete({ where: { id: m.workspaceId } }).catch(() => {});
    }
    await prisma.user.delete({ where: { id: u.id } });
    console.log(`  ✗ ${u.email}`);
  }

  const remaining = await prisma.user.findMany({ select: { email: true }, orderBy: { createdAt: 'asc' } });
  console.log(`\n✅ Done. ${remaining.length} accounts remain: ${remaining.map((r) => r.email).join(', ')}`);
  await prisma.$disconnect();
}
main().then(() => process.exit(0)).catch((e) => { console.error('ERR', e); process.exit(1); });
