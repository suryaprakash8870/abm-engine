import 'dotenv/config';

async function main() {
  const domain = process.argv[2] ?? 'intercom.com';
  const res = await fetch('https://api.prospeo.io/search-person', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-KEY': process.env.PROSPEO_API_KEY ?? '' },
    body: JSON.stringify({ page: 1, filters: { company: { websites: { include: [domain] } } } }),
  });
  const j = (await res.json()) as Record<string, unknown>;
  console.log('HTTP', res.status, 'error_code:', j.error_code ?? '(none)');
  console.log('TOP-LEVEL KEYS:', Object.keys(j).join(', '));
  // Try to find the people array and print a few names+titles.
  const r = (j.response ?? j) as Record<string, unknown>;
  const arr = (r.people ?? r.results ?? r.data ?? (j as Record<string, unknown>).results) as unknown;
  if (Array.isArray(arr)) {
    console.log('RESULT COUNT:', arr.length);
    for (const it of arr.slice(0, 6)) {
      const o = (it as Record<string, unknown>);
      const p = (o.person ?? o) as Record<string, unknown>;
      console.log('  •', p.full_name ?? p.name, '—', p.job_title ?? p.title, '| id:', p.person_id ?? p.id, '| li:', p.linkedin_url ?? p.linkedin);
    }
    console.log('\nRAW first item:', JSON.stringify(arr[0]).slice(0, 900));
  } else {
    console.log('No array found. RAW (900 chars):', JSON.stringify(j).slice(0, 900));
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error('ERR', e); process.exit(1); });
