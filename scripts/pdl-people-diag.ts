import 'dotenv/config';

const KEY = process.env.PDL_API_KEY ?? '';
const BASE = 'https://api.peopledatalabs.com/v5';

async function personSearch(sql: string, size = 2): Promise<Record<string, unknown>> {
  const res = await fetch(`${BASE}/person/search`, {
    method: 'POST',
    headers: { 'X-Api-Key': KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql, size }),
  });
  return { status: res.status, ...(await res.json().catch(() => ({}))) } as Record<string, unknown>;
}

async function main() {
  if (!KEY) { console.log('No PDL_API_KEY.'); return; }
  // scrum.org = one of your discovered cos; elastic.co = a known-good one.
  for (const domain of ['scrum.org', 'elastic.co']) {
    const r = await personSearch(`SELECT * FROM person WHERE job_company_website='${domain}'`, 2);
    console.log(`\n${domain}: status ${r.status} | total ${r.total ?? 0} | ${r.error ? JSON.stringify(r.error).slice(0, 90) : ''}`);
    const data = (r.data ?? []) as Array<Record<string, unknown>>;
    for (const p of data) {
      console.log(`  • ${p.full_name} — ${p.job_title}`);
      console.log(`      work_email: ${p.work_email ?? '(null/gated)'}  | emails: ${JSON.stringify(p.emails ?? []).slice(0, 80)}  | li: ${p.linkedin_url ?? '—'}`);
    }
    if (data[0]) console.log('  email-related keys present:', Object.keys(data[0]).filter((k) => /email/i.test(k)).join(', ') || '(none)');
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error('ERR', e); process.exit(1); });
