import 'dotenv/config';

const KEY = process.env.PDL_API_KEY ?? '';

async function main() {
  if (!KEY) { console.log('No PDL_API_KEY.'); return; }
  // Enrich a known person (Scrum.org CEO) and see if the ACTUAL email is revealed
  // on the free Person Starter bundle, or if it's still gated as `true`.
  const res = await fetch(`https://api.peopledatalabs.com/v5/person/enrich?profile=${encodeURIComponent('linkedin.com/in/davidjustinwest')}`, {
    headers: { 'X-Api-Key': KEY },
  });
  const j = (await res.json()) as Record<string, unknown>;
  const d = (j.data ?? j) as Record<string, unknown>;
  console.log('status', res.status, '| likelihood', j.likelihood ?? '-');
  console.log('name:', d.full_name, '| title:', d.job_title);
  console.log('work_email       :', JSON.stringify(d.work_email));
  console.log('emails           :', JSON.stringify(d.emails ?? []).slice(0, 200));
  console.log('recommended_email:', JSON.stringify(d.recommended_personal_email));
  console.log('\n→ If work_email is an actual "name@scrum.org" string, PDL gives emails on your tier.');
  console.log('→ If it is `true` / null, emails are gated (paid add-on).');
}
main().then(() => process.exit(0)).catch((e) => { console.error('ERR', e); process.exit(1); });
