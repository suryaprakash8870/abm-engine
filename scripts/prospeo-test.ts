/**
 * Prospeo live smoke test — run with YOUR key to verify the integration and see
 * exactly how many credits one account costs, BEFORE wiring it into the demo.
 *
 *   PROSPEO_API_KEY=xxxx CONTACT_SOURCE=prospeo npx tsx scripts/prospeo-test.ts intercom.com
 *   # add PROSPEO_DEBUG=1 to print the raw API responses if the shapes look off
 *
 * Costs ~1 (search) + up to 3 (enrich) = ~4 credits. Nothing is written to the DB.
 */
import 'dotenv/config';
import { searchPeople, shouldUseProspeo, prospeoCreditsUsed } from '../lib/clients/prospeo';

async function main() {
  const domain = process.argv[2] ?? 'intercom.com';
  if (!shouldUseProspeo()) {
    console.log('Prospeo is OFF. Run with:  PROSPEO_API_KEY=... CONTACT_SOURCE=prospeo npx tsx scripts/prospeo-test.ts ' + domain);
    return;
  }
  console.log(`Sourcing the buying committee at ${domain} via Prospeo…`);
  const groups: Array<{ label: string; titles: string[] }> = [
    { label: 'Decision-makers', titles: ['Chief Executive Officer', 'Chief Marketing Officer', 'VP Marketing', 'Head of Growth'] },
    { label: 'Champions', titles: ['Director of Marketing', 'Senior Manager'] },
    { label: 'Influencers', titles: ['Senior Analyst', 'Marketing Manager', 'Operations Manager'] },
  ];
  let total = 0;
  for (const g of groups) {
    const people = await searchPeople(domain, domain, g.titles, 3); // 1st call builds+caches; rest are free
    console.log(`\n${g.label}:`);
    if (people.length === 0) console.log('  (none in this role)');
    for (const p of people) {
      console.log(`  • ${p.fullName} — ${p.title}  <${p.email}>`);
      total++;
    }
  }
  if (total === 0) {
    console.log('\nNo verified emails returned. Re-run with PROSPEO_DEBUG=1 and share the output so the mapping can be adjusted.');
  }
  console.log(`\nContacts: ${total}   Credits used this run: ${prospeoCreditsUsed()}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error('ERR', e); process.exit(1); });
