import 'dotenv/config';

async function main() {
  const filters = {
    company_industry: { include: ['Software Development', 'IT Services and IT Consulting'] },
    company_headcount_range: ['501-1000', '1001-2000', '2001-5000'],
  };
  const res = await fetch('https://api.prospeo.io/search-company', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-KEY': process.env.PROSPEO_API_KEY ?? '' },
    body: JSON.stringify({ page: 1, filters }),
  });
  const j = (await res.json()) as Record<string, unknown>;
  console.log('HTTP', res.status, '| error:', j.error, '| error_code:', j.error_code ?? '', '|', String(j.filter_error ?? ''));
  const arr = (j.results ?? (j.response as Record<string, unknown>)?.results ?? []) as unknown;
  if (Array.isArray(arr)) {
    console.log('COUNT:', arr.length, '| pagination:', JSON.stringify(j.pagination ?? {}).slice(0, 120));
    for (const it of arr.slice(0, 10)) {
      const c = ((it as Record<string, unknown>).company ?? it) as Record<string, unknown>;
      console.log('  •', c.name, '|', c.website ?? c.domain, '|', c.industry, '| hc:', c.employee_count ?? c.employee_range);
    }
    console.log('\nRAW first item:', JSON.stringify(arr[0]).slice(0, 1200));
  } else {
    console.log('No results array. RAW:', JSON.stringify(j).slice(0, 600));
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error('ERR', e); process.exit(1); });
