import 'dotenv/config';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function call(filters: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await fetch('https://api.prospeo.io/search-company', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-KEY': process.env.PROSPEO_API_KEY ?? '' },
    body: JSON.stringify({ page: 1, filters }),
  });
  const j = (await res.json()) as Record<string, unknown>;
  return { status: res.status, ...j };
}

function printCompanies(j: Record<string, unknown>): void {
  const arr = (j.results ?? (j.response as Record<string, unknown>)?.results ?? []) as unknown;
  if (!Array.isArray(arr)) { console.log('  (no results array) keys:', Object.keys(j).join(',')); return; }
  console.log('  COUNT:', arr.length);
  for (const it of arr.slice(0, 8)) {
    const c = ((it as Record<string, unknown>).company ?? it) as Record<string, unknown>;
    console.log('   •', c.name, '|', c.website ?? c.domain, '|', c.industry, '| hc:', c.employee_count ?? c.headcount ?? c.current_headcount ?? c.company_headcount);
  }
  console.log('\n  RAW first item:', JSON.stringify(arr[0]).slice(0, 1400));
}

async function main() {
  const attempts: Array<{ label: string; filters: Record<string, unknown> }> = [
    { label: 'company_industry {include} LinkedIn names', filters: { company_industry: { include: ['Computer Software', 'Information Technology & Services', 'Computer & Network Security', 'Internet'] } } },
    { label: 'company_industry {include} short names', filters: { company_industry: { include: ['Software', 'Information Technology', 'Security', 'Internet'] } } },
  ];
  for (const a of attempts) {
    const j = await call(a.filters);
    if (j.status === 200 && j.error !== true) { console.log('✓ WORKS →', a.label); printCompanies(j); return; }
    console.log('✗', a.label, '→', j.status, j.error_code, '|', String(j.filter_error ?? '').slice(0, 140));
    await wait(3000); // stay under Prospeo's per-second cap
  }
  console.log('\nStill no luck — will switch strategy.');
}
main().then(() => process.exit(0)).catch((e) => { console.error('ERR', e); process.exit(1); });
