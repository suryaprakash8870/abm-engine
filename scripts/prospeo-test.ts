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
  console.log(`Sourcing decision-makers at ${domain} via Prospeo…\n`);
  const titles = ['Chief Executive Officer', 'Chief Marketing Officer', 'VP of Marketing', 'Head of Growth'];
  const people = await searchPeople(domain, domain, titles, 3);

  if (people.length === 0) {
    console.log('No people with a verified email returned. If you expected results, re-run with PROSPEO_DEBUG=1 and share the raw output so the filter/response mapping can be adjusted.');
  }
  for (const p of people) {
    console.log(`• ${p.fullName} — ${p.title}`);
    console.log(`    email: ${p.email}   linkedin: ${p.linkedinUrl ?? '—'}`);
  }
  console.log(`\nCredits used this run: ${prospeoCreditsUsed()}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error('ERR', e); process.exit(1); });
