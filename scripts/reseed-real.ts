/**
 * REAL demo mode — the switch's "real" side, via LIVE Prospeo discovery.
 *
 * Resets a workspace and rebuilds the pipeline on REAL data: search-company finds
 * companies matching the ICP (1 credit for 25), with real firmographics, scored on
 * that data; then sources real committees for the top few (credit-capped). Every
 * page (ICP → Target Accounts → Scoring → Contacts) shows real, verifiable data.
 *
 *   PROSPEO_API_KEY=... CONTACT_SOURCE=prospeo TAM_SOURCE=prospeo \
 *     npx tsx scripts/reseed-real.ts [email]
 *
 * [email] targets a specific login's workspace (default: the oldest workspace).
 * Flip back to the sample demo any time:  npx tsx scripts/reseed-local.ts
 */
import 'dotenv/config';
process.env.TAM_SOURCE ??= 'prospeo';
import { prisma } from '../lib/db/client';
import { Prisma } from '@prisma/client';
import { resetDemoWorkspace } from '../lib/engines/demo-seed/seed';
import { searchCompanies } from '../lib/clients/company-provider';
import { cachedFirmographics, shouldUseProspeo, prospeoCreditsUsed, type ProspeoCompanyData } from '../lib/clients/prospeo';
import { pdlEnrichCompany } from '../lib/clients/pdl';
import { sourceAccountCommittee } from '../lib/engines/contact-engine/service';

const ICP_INDUSTRIES = ['Cybersecurity', 'Cloud Infrastructure', 'Information Technology', 'Software'];
const PREFERRED_TECH = ['aws', 'gcp', 'azure', 'snowflake', 'datadog', 'salesforce', 'react', 'kubernetes', 'segment', 'stripe', 'hubspot', 'python', 'go', 'ruby'];
const INDUSTRY_KEYWORDS = ['software', 'technolog', 'security', 'cloud', 'information', 'internet', 'saas', 'computer', 'data', 'platform', 'infrastructure', 'developer', 'devops', 'analytics', 'consulting', 'services'];
const CONTACTS_FOR_TOP = 3; // only source committees for the top-N by score (credit control)

const ICP = {
  firmographics: { industries: ICP_INDUSTRIES, employee_min: 500, employee_max: 5000, headcount: { min: 500, max: 5000 }, revenue: ['$25M-$50M', '$50M-$100M', '$100M-$200M', '$200M-$500M', '$500M+'], geographies: ['United States', 'United Kingdom', 'Ireland', 'Germany', 'Canada', 'Australia'], business_model: 'B2B SaaS', fundingStages: ['series_b', 'series_c', 'series_d', 'public', 'private'] },
  technographics: { required: [] as string[], preferred: ['AWS', 'GCP', 'Snowflake', 'Datadog', 'Salesforce', 'React', 'Kubernetes'], disqualifying: [] as string[] },
  signals: { trigger_events: ['new_cmo_hired', 'series_b_round', 'launched_new_product'], intent_topics: ['account based marketing', 'rev ops automation'] },
  exclusions: { industries: ['Government', 'Education'], sub_500_headcount: true },
};
const CRITERIA = [
  { key: 'industry_fit', label: 'Industry fit', weight: 0.30, rationale: 'Core ICP industries: Cybersecurity, Cloud, IT, Software.' },
  { key: 'company_size', label: 'Company size (500–5000)', weight: 0.25, rationale: 'Below 500 lacks budget; above 5000 is a different motion.' },
  { key: 'tech_stack', label: 'Tech stack match', weight: 0.25, rationale: 'Modern cloud/data stack preferred.' },
  { key: 'buying_signals', label: 'Buying signals', weight: 0.20, rationale: 'Qualification + intent proxy until signal data lands.' },
];
const BOUNDARIES = { tier1_min: 75, tier2_min: 50, tier3_min: 25 };

function scoreOf(fm: ProspeoCompanyData) {
  const ind = (fm.industry ?? '').toLowerCase();
  const industryMatch = ind && INDUSTRY_KEYWORDS.some((k) => ind.includes(k)) ? 1 : 0;
  const hc = fm.headcount ?? 0;
  const sizeMatch = hc >= 500 && hc <= 5000 ? 1 : hc >= 250 && hc <= 12000 ? 0.5 : 0;
  const techMatch = fm.techStack.some((t) => PREFERRED_TECH.includes(t.toLowerCase())) ? 1 : 0.5;
  const rows = [
    { key: 'industry_fit', match: industryMatch, weight: 0.30 },
    { key: 'company_size', match: sizeMatch, weight: 0.25 },
    { key: 'tech_stack', match: techMatch, weight: 0.25 },
    { key: 'buying_signals', match: 0.5, weight: 0.20 },
  ].map((c) => ({ ...c, contribution: Math.round(c.match * c.weight * 100 * 10) / 10 }));
  const total = Math.min(100, Math.round(rows.reduce((s, c) => s + c.contribution, 0)));
  const tier = total >= 75 ? 1 : total >= 50 ? 2 : total >= 25 ? 3 : null;
  return { total, tier: tier as 1 | 2 | 3 | null, criterionScores: rows };
}

async function main() {
  if (!shouldUseProspeo()) { console.log('Set .env:  CONTACT_SOURCE=prospeo  and  PROSPEO_API_KEY=...'); return; }
  const email = process.argv[2];
  const wm = email
    ? await prisma.workspaceMember.findFirst({ where: { user: { email } }, select: { workspaceId: true } })
    : await prisma.workspaceMember.findFirst({ orderBy: { createdAt: 'asc' }, select: { workspaceId: true } });
  if (!wm) { console.log(email ? `No workspace for ${email}.` : 'No workspace found.'); return; }
  const workspaceId = wm.workspaceId;

  console.log(`Resetting ${email ?? 'oldest'} workspace to REAL mode + discovering companies via Prospeo…`);
  await resetDemoWorkspace(workspaceId);
  const now = new Date();

  const icp = await prisma.icpDefinition.create({ data: { workspaceId, version: 1, mode: 'hypothesis', firmographics: ICP.firmographics, technographics: ICP.technographics, signals: ICP.signals, exclusions: ICP.exclusions, confidenceScore: 0.82, createdAt: now } });
  await prisma.icpVersion.create({ data: { icpId: icp.id, versionNumber: 1, snapshot: ICP as unknown as Prisma.InputJsonValue, createdAt: now } });
  const tamJob = await prisma.tamBuildJob.create({ data: { workspaceId, icpId: icp.id, status: 'completed', totalFound: 25, processed: 25, accountLimit: 1000, filters: ICP.firmographics as unknown as Prisma.InputJsonValue, startedAt: now, completedAt: now } });
  const enrJob = await prisma.enrichmentJob.create({ data: { workspaceId, sourceJobId: tamJob.id, icpId: icp.id, status: 'completed', total: 25, enriched: 25, failed: 0, qualifiedCount: 25, disqualifiedCount: 0, startedAt: now, completedAt: now } });
  await prisma.scoringFormula.create({ data: { workspaceId, icpId: icp.id, version: 1, criteria: CRITERIA as unknown as Prisma.InputJsonValue, tierBoundaries: BOUNDARIES as unknown as Prisma.InputJsonValue, isFallback: false, createdBy: 'system', createdAt: now } });
  const tal = await prisma.targetAccountList.create({ data: { workspaceId, name: 'Target Account List', version: 1, accountCount: 0, status: 'finalized', reviewStatus: 'reviewed', createdAt: now, updatedAt: now } });

  // ── Discover real companies (1 credit) ──
  const page = await searchCompanies({ industries: ICP_INDUSTRIES, employeeMin: 500, employeeMax: 5000, geographies: [] }, 1);
  console.log(`Discovered ${page.companies.length} real companies (of ${page.total.toLocaleString()} matching). Scoring…\n`);

  const talRows: Array<{ enrichedId: string; domain: string; name: string; tier: number; score: number }> = [];
  for (const c of page.companies) {
    // Prefer PDL (real firmographics + tech tags, own free credits); else the
    // Prospeo firmographics captured during discovery; else the search basics.
    const fm: ProspeoCompanyData = (await pdlEnrichCompany(c.domain)) ?? cachedFirmographics(c.domain) ?? { name: c.name, industry: c.industry, headcount: c.employees, revenue: null, geography: c.geography, fundingStage: 'private', techStack: [] };
    const raw = await prisma.rawAccount.create({ data: { workspaceId, jobId: tamJob.id, domain: c.domain, name: fm.name ?? c.domain, source: 'prospeo', createdAt: now } });
    const enr = await prisma.enrichedAccount.create({ data: { workspaceId, jobId: enrJob.id, accountId: raw.id, domain: c.domain, name: fm.name ?? c.domain, industry: fm.industry, headcount: fm.headcount, revenue: fm.revenue, geography: fm.geography, fundingStage: fm.fundingStage, techStack: fm.techStack, dataQualityScore: 0.95, enrichmentSources: ['prospeo'], enrichedAt: now } });
    const s = scoreOf(fm);
    await prisma.qualificationResult.create({ data: { workspaceId, accountId: raw.id, qualified: s.tier === 1 || s.tier === 2, confidence: 0.9, reason: `${fm.industry ?? '—'} · ${fm.headcount ?? '—'} employees`, disqualifyingFactors: [], createdAt: now } });
    await prisma.accountScore.create({ data: { workspaceId, accountId: enr.id, formulaVersion: 1, totalScore: s.total, tier: s.tier, criterionScores: s.criterionScores as unknown as Prisma.InputJsonValue, scoredAt: now } });
    await prisma.scoreHistory.create({ data: { workspaceId, accountId: enr.id, score: s.total, tier: s.tier, recordedAt: now } });
    if (s.tier === 1 || s.tier === 2) talRows.push({ enrichedId: enr.id, domain: c.domain, name: fm.name ?? c.domain, tier: s.tier, score: s.total });
    console.log(`  • ${(fm.name ?? c.domain).padEnd(22)} ${String(fm.headcount ?? '—').padStart(5)} emp  score ${s.total} (Tier ${s.tier ?? '—'})`);
  }

  for (const r of talRows) await prisma.talAccount.create({ data: { workspaceId, talId: tal.id, accountId: r.enrichedId, domain: r.domain, name: r.name, tier: r.tier, score: r.score, addedAt: now } });
  await prisma.targetAccountList.update({ where: { id: tal.id }, data: { accountCount: talRows.length } });
  await prisma.talVersion.create({ data: { workspaceId, talId: tal.id, versionNumber: 1, snapshot: { account_count: talRows.length } as unknown as Prisma.InputJsonValue, sourceCorrelationId: 'real_discover_v1', createdAt: now } });

  // ── Committees for the top few (credit-capped) ──
  const top = [...talRows].sort((a, b) => b.score - a.score).slice(0, CONTACTS_FOR_TOP);
  console.log(`\nSourcing committees for the top ${top.length} by score…`);
  for (const r of top) {
    const res = await sourceAccountCommittee(workspaceId, r.enrichedId, r.tier as 1 | 2, r.domain, r.name);
    console.log(`  ${r.name}: ${res.contactsFound} contacts`);
  }

  console.log(`\n✅ REAL mode ready — ${talRows.length} real companies in the list, ${top.length} with real committees.  Credits used: ${prospeoCreditsUsed()}`);
  console.log('   Refresh the app → ICP / Target Accounts / Scoring / Contacts. Flip back: npx tsx scripts/reseed-local.ts');
  await prisma.$disconnect();
}
main().then(() => process.exit(0)).catch((e) => { console.error('ERR', e); process.exit(1); });
