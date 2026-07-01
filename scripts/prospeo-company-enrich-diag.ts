import 'dotenv/config';

async function main() {
  const res = await fetch('https://api.prospeo.io/enrich-company', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-KEY': process.env.PROSPEO_API_KEY ?? '' },
    body: JSON.stringify({ data: { company_website: process.argv[2] ?? 'intercom.com' } }),
  });
  const j = (await res.json()) as Record<string, unknown>;
  console.log('HTTP', res.status, '| error:', j.error, '| error_code:', j.error_code ?? '');
  console.log('TOP KEYS:', Object.keys(j).join(', '));
  const c = (j.company ?? (j.response as Record<string, unknown>)?.company ?? null) as Record<string, unknown> | null;
  if (c) console.log('COMPANY KEYS:', Object.keys(c).join(', '));
  console.log('\nRAW:', JSON.stringify(j).slice(0, 1800));
}
main().then(() => process.exit(0)).catch((e) => { console.error('ERR', e); process.exit(1); });
