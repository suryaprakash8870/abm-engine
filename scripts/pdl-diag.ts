import 'dotenv/config';

const KEY = process.env.PDL_API_KEY ?? '';
const BASE = 'https://api.peopledatalabs.com/v5';

async function get(path: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${BASE}${path}`, { headers: { 'X-Api-Key': KEY } });
  return { status: res.status, ...(await res.json().catch(() => ({}))) } as Record<string, unknown>;
}
async function post(path: string, body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(`${BASE}${path}`, { method: 'POST', headers: { 'X-Api-Key': KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { status: res.status, ...(await res.json().catch(() => ({}))) } as Record<string, unknown>;
}

async function main() {
  if (!KEY) { console.log('Add PDL_API_KEY to .env first.'); return; }

  console.log('=== COMPANY SEARCH (size 3) ===');
  const cs = await post('/company/search', {
    sql: "SELECT * FROM company WHERE industry IN ('computer software','information technology and services') AND employee_count BETWEEN 500 AND 5000",
    size: 3,
  });
  console.log('status', cs.status, '| total', cs.total, '| error', JSON.stringify(cs.error ?? '').slice(0, 120));
  const cData = (cs.data ?? []) as Array<Record<string, unknown>>;
  for (const c of cData) console.log('  •', c.name, '|', c.website, '|', c.industry, '| emp:', c.employee_count, '| tags:', JSON.stringify(c.tags ?? c.technologies ?? []).slice(0, 80));
  if (cData[0]) console.log('  company keys:', Object.keys(cData[0]).join(', ').slice(0, 300));

  console.log('\n=== COMPANY ENRICH (intercom.com + your domains) ===');
  for (const d of ['intercom.com', 'kraftylumin.com', 'onegtmlab.com']) {
    const ce = await get(`/company/enrich?website=${d}`);
    console.log(`  ${d}: status ${ce.status} | name ${ce.name ?? '(NOT in DB)'} | industry ${ce.industry ?? '-'} | emp ${ce.employee_count ?? '-'} | ${ce.error ? JSON.stringify(ce.error).slice(0, 80) : ''}`);
  }

  console.log('\n=== PERSON SEARCH @ intercom.com (size 2) ===');
  const ps = await post('/person/search', {
    sql: "SELECT * FROM person WHERE job_company_website='intercom.com'",
    size: 2,
  });
  console.log('status', ps.status, '| total', ps.total, '| error', JSON.stringify(ps.error ?? '').slice(0, 120));
  const pData = (ps.data ?? []) as Array<Record<string, unknown>>;
  for (const p of pData) console.log('  •', p.full_name, '|', p.job_title, '| email:', p.work_email ?? p.recommended_personal_email ?? '(none — gated?)', '| li:', p.linkedin_url);
  if (pData[0]) console.log('  person keys:', Object.keys(pData[0]).join(', ').slice(0, 400));
}
main().then(() => process.exit(0)).catch((e) => { console.error('ERR', e); process.exit(1); });
