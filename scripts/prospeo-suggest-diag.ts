import 'dotenv/config';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function suggest(field: string, q: string): Promise<void> {
  const res = await fetch('https://api.prospeo.io/search-suggestions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-KEY': process.env.PROSPEO_API_KEY ?? '' },
    body: JSON.stringify({ [field]: q }),
  });
  const j = (await res.json()) as Record<string, unknown>;
  const nonNull = Object.entries(j).filter(([k, v]) => v != null && v !== false && k !== 'error');
  console.log(`${field}("${q}") →`, nonNull.length ? JSON.stringify(Object.fromEntries(nonNull)).slice(0, 500) : `(all null) ${j.error_code ?? ''}`);
}

async function main() {
  // Find the suggestions field that feeds the company_industry filter.
  for (const q of ['software', 'security', 'cloud', 'information']) {
    await suggest('company_industry_search', q);
    await wait(1500);
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error('ERR', e); process.exit(1); });
