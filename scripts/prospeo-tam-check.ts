import 'dotenv/config';
process.env.TAM_SOURCE = 'prospeo';
import { searchCompanies } from '../lib/clients/company-provider';
import { enrichCompany } from '../lib/clients/enrich';
import { prospeoCreditsUsed } from '../lib/clients/prospeo';

async function main() {
  const params = { industries: ['Cybersecurity', 'Cloud Infrastructure', 'Information Technology', 'Software'], employeeMin: 500, employeeMax: 5000, geographies: [] };
  const page = await searchCompanies(params, 1);
  console.log(`TAM discovery → ${page.companies.length} real companies (of ${page.total} total). Credits: ${prospeoCreditsUsed()}\n`);
  for (const c of page.companies.slice(0, 8)) console.log(`  • ${c.name} | ${c.domain} | ${c.industry} | ${c.employees} emp`);

  if (page.companies[0]) {
    const c = page.companies[0];
    const e = await enrichCompany(c.domain, c.name ?? c.domain);
    console.log(`\nEnrichment of ${c.name} (should be source=prospeo, 0 extra credits — reused from cache):`);
    console.log(`  ${JSON.stringify(e)}`);
    console.log(`\nCredits after enrich: ${prospeoCreditsUsed()} (unchanged if cache reuse worked)`);
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error('ERR', e); process.exit(1); });
