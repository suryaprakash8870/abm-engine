/**
 * Rename a login email, keeping the same password + workspace + all data.
 * Auth is email + bcrypt (User.email @unique, User.passwordHash), so only the
 * login identifier changes — the real data lives on the workspace, untouched.
 *
 *   npx tsx scripts/rename-account.ts [oldEmail] [newEmail]
 */
import 'dotenv/config';
import { prisma } from '../lib/db/client';

async function main() {
  const OLD = process.argv[2] ?? 'prospeo@gmail.com';
  const NEW = process.argv[3] ?? 'abm@gmail.com';

  const clash = await prisma.user.findUnique({ where: { email: NEW }, select: { id: true } });
  if (clash) { console.log(`✗ ${NEW} already exists — choose another email.`); return; }
  const u = await prisma.user.findUnique({ where: { email: OLD }, select: { id: true } });
  if (!u) { console.log(`✗ ${OLD} not found.`); return; }

  await prisma.user.update({ where: { email: OLD }, data: { email: NEW } });
  console.log(`✅ Renamed ${OLD} → ${NEW}.`);
  console.log(`   Log out, then log in with ${NEW} and the SAME password. Data is unchanged.`);
  await prisma.$disconnect();
}
main().then(() => process.exit(0)).catch((e) => { console.error('ERR', e); process.exit(1); });
