import 'dotenv/config';
import { searchPeople, verifyEmail } from '../lib/clients/contact-provider';
import { shouldUseProspeo } from '../lib/clients/prospeo';

async function main() {
  console.log('Prospeo enabled?', shouldUseProspeo(), '(expect false — CONTACT_SOURCE unset → unchanged behavior)');
  const people = await searchPeople('cobalt.com', 'Cobalt AI', ['Chief Executive Officer', 'VP of Marketing'], 2);
  console.log('Contacts from fallback path:', people.length);
  for (const p of people) {
    const v = await verifyEmail(p.email);
    console.log(` • ${p.fullName} — ${p.title} — ${p.email} — ${v.status}`);
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error('ERR', e); process.exit(1); });
