/**
 * Smoke test: fire a play for a real TAL account through the production
 * orchestrator path (fireManualPlay → publishPlayFired → notifyPlayFired),
 * which sends the real Telegram alert. Same code the /plays/fire route runs.
 */
import { prisma } from '@/lib/db/client';
import { fireManualPlay } from '@/lib/engines/demand-gen-orchestrator/service';
import { publishPlayFired } from '@/lib/engines/demand-gen-orchestrator/publisher';
import { notifyPlayFired } from '@/lib/engines/demand-gen-orchestrator/notify';
import { newCorrelationId } from '@/lib/events';

(async () => {
  const acct = await prisma.talAccount.findFirst({
    where: { name: { not: null } },
    orderBy: { tier: 'asc' },
    select: { workspaceId: true, accountId: true, name: true },
  });
  if (!acct) { console.error('No named TAL account found'); process.exit(1); }
  console.log(`Firing play for ${acct.name} (${acct.accountId})…`);

  const correlationId = newCorrelationId();
  const result = await fireManualPlay(
    acct.workspaceId,
    { account_id: acct.accountId, stage: 'selecting', trigger_type: 'account.hot' },
    correlationId,
  );
  console.log('Orchestration:', result.status, result.status === 'suppressed' ? `(${result.reason})` : '');

  if (result.status === 'fired') {
    await publishPlayFired(result.payload, { workspaceId: acct.workspaceId, correlationId });
    await notifyPlayFired(acct.workspaceId, result.payload);
    console.log('Play fired + Telegram alert sent. Play type:', result.payload.play_type);
  }
  await prisma.$disconnect();
  process.exit(0);
})().catch((e) => { console.error(e.message); process.exit(1); });
