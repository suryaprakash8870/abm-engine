/** Smoke test: push one real TAL account to HubSpot via the live adapter. */
import { prisma } from '@/lib/db/client';
import { getCrmAdapter } from '@/lib/engines/crm-sync-engine/crm-adapter';

(async () => {
  const acct = await prisma.talAccount.findFirst({
    where: { name: { not: null }, domain: { not: null } },
    select: { accountId: true, name: true, domain: true, tier: true },
  });
  const adapter = getCrmAdapter(null); // null → falls back to HUBSPOT_SERVICE_KEY
  console.log('Adapter:', adapter.kind);
  if (!acct) { console.log('No named+domained TAL account; pushing a placeholder.'); }

  const fields = acct
    ? { abm_tier: acct.tier, name: acct.name, domain: acct.domain }
    : { name: 'ABM Engine Test Co', domain: 'abm-engine-test.com' };
  const recordId = acct?.accountId ?? 'test-record';

  const out = await adapter.upsertAccount({ recordType: 'account', recordId, fields });
  console.log('upsertAccount →', JSON.stringify(out, null, 2));
  await prisma.$disconnect();
  process.exit(out.ok ? 0 : 1);
})().catch((e) => { console.error(e.message); process.exit(1); });
