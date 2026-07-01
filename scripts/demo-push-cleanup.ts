import 'dotenv/config';
import { prisma } from '../lib/db/client';

async function main() {
  const jobs = await prisma.syncJob.findMany({
    where: { correlationId: { startsWith: 'verify_' } },
    select: { id: true },
  });
  const jobIds = jobs.map((j) => j.id);
  const logs = await prisma.syncLog.deleteMany({ where: { syncJobId: { in: jobIds } } });
  const delJobs = await prisma.syncJob.deleteMany({ where: { id: { in: jobIds } } });
  console.log('Removed verification artifacts:', JSON.stringify({ jobs: delJobs.count, logs: logs.count }));
  await prisma.$disconnect();
}
main().catch((e) => { console.error('ERR', e); process.exit(1); });
