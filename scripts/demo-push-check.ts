import 'dotenv/config';
import { prisma } from '../lib/db/client';
import { syncTalToCrm } from '../lib/engines/crm-sync-engine/service';

async function main() {
  const ws = await prisma.workspaceMember.findFirst({ orderBy: { createdAt: 'asc' }, select: { workspaceId: true } });
  if (!ws) { console.log('No workspace.'); return; }
  const t0 = Date.now();
  const summary = await syncTalToCrm(ws.workspaceId, `verify_${'x'.repeat(6)}`);
  const ms = Date.now() - t0;
  console.log('PUSH_RESULT:', JSON.stringify(summary));
  console.log('ELAPSED_MS:', ms);
  console.log('CRM_PUSH_LIVE env:', process.env.CRM_PUSH_LIVE ?? '(unset → mock)');
  await prisma.$disconnect();
}
main().catch((e) => { console.error('ERR', e); process.exit(1); });
