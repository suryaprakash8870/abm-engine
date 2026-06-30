/**
 * Demo data seeder — turns an empty workspace into a fully-populated, end-to-end
 * demo state across all 11 engines in one call. Deterministic + idempotent:
 * calling it twice replaces the demo data with the same state.
 *
 * NOT a production migration tool — it bypasses event publication and directly
 * writes to engine tables. Purpose: let a teammate walk through every page
 * without manually running the ICP wizard, TAM build, enrichment, etc.
 */

import { prisma } from '../../db/client';
import { Prisma } from '@prisma/client';

const DEMO_TAG = '__demo__'; // marker we drop on a few rows so resets can find them later

// ─────────────────────────────────────────────────────────────────────────────
// Fixture: 10 companies (matches the look the user wants to demo)
// ─────────────────────────────────────────────────────────────────────────────

interface CompanyFixture {
  domain: string;
  name: string;
  industry: string;
  headcount: number;
  revenue: string;
  geography: string;
  fundingStage: string;
  techStack: string[];
  /** AI qualification verdict + reason. */
  qualified: boolean;
  qualReason: string;
  /** Final scoring + tier (matches realistic distribution). */
  score: number;
  tier: 1 | 2 | 3 | null;
  /** Heat: how many signals + plays + awareness this account gets in the demo. */
  heat: 'hot' | 'warm' | 'cool' | 'cold';
}

const COMPANIES: CompanyFixture[] = [
  { domain: 'cobalt.com',   name: 'Cobalt AI',          industry: 'Cybersecurity',       headcount: 1704, revenue: '$200M-$500M', geography: 'United States', fundingStage: 'series_c', techStack: ['HubSpot','AWS','Snowflake','Salesforce'], qualified: true,  qualReason: 'Cybersecurity sector match · 1,000+ headcount · series C funding · running modern data stack', score: 100, tier: 1, heat: 'hot'  },
  { domain: 'vertex.com',   name: 'Vertex Software',    industry: 'Cloud Infrastructure',headcount: 1171, revenue: '$100M-$200M', geography: 'United States', fundingStage: 'series_b', techStack: ['HubSpot','GCP','Datadog'], qualified: true, qualReason: 'Cloud infrastructure ICP · mid-market headcount · proven HubSpot adoption',                                  score: 88,  tier: 1, heat: 'hot' },
  { domain: 'nimbus.com',   name: 'Nimbus Labs',        industry: 'Information Technology', headcount: 1959, revenue: '$200M-$500M', geography: 'United Kingdom', fundingStage: 'public',  techStack: ['Salesforce','AWS'],                  qualified: true, qualReason: 'IT services + enterprise headcount · public-company validation',                                            score: 82,  tier: 1, heat: 'warm' },
  { domain: 'quanta.com',   name: 'Quanta Technologies',industry: 'Information Technology', headcount: 979, revenue: '$50M-$100M',  geography: 'United States', fundingStage: 'series_b', techStack: ['HubSpot','Azure','Looker'],          qualified: true, qualReason: 'IT services · 500-1000 headcount · series B with modern analytics stack',                                  score: 68,  tier: 2, heat: 'warm' },
  { domain: 'lumen.com',    name: 'Lumen Cloud',        industry: 'Software',            headcount: 656, revenue: '$25M-$50M',   geography: 'Germany',       fundingStage: 'series_a', techStack: ['HubSpot','Vercel'],                  qualified: true, qualReason: 'SMB software vendor · early HubSpot adoption · European market',                                           score: 60,  tier: 2, heat: 'cool' },
  { domain: 'pinnacle.com', name: 'Pinnacle Systems',   industry: 'Cloud Infrastructure',headcount: 443, revenue: '$25M-$50M',   geography: 'Canada',        fundingStage: 'series_a', techStack: ['AWS','Datadog'],                     qualified: true, qualReason: 'Cloud infrastructure with right headcount · no HubSpot yet (lower fit)',                                    score: 55,  tier: 2, heat: 'cool' },
  { domain: 'apex.com',     name: 'Apex Systems',       industry: 'Manufacturing',       headcount: 965, revenue: '$50M-$100M',  geography: 'United States', fundingStage: 'public',   techStack: ['Salesforce'],                        qualified: false,qualReason: 'Manufacturing sector outside core ICP',                                                                     score: 52,  tier: 2, heat: 'cold' },
  { domain: 'zenith.com',   name: 'Zenith Works',       industry: 'Manufacturing',       headcount: 683, revenue: '$25M-$50M',   geography: 'United States', fundingStage: 'private',  techStack: ['Salesforce'],                        qualified: false,qualReason: 'Manufacturing sector outside core ICP',                                                                     score: 45,  tier: 3, heat: 'cold' },
  { domain: 'orbit.com',    name: 'Orbit HQ',           industry: 'Manufacturing',       headcount: 381, revenue: '$10M-$25M',   geography: 'Australia',     fundingStage: 'seed',     techStack: ['HubSpot'],                           qualified: false,qualReason: 'Below headcount threshold + sector mismatch',                                                                score: 38,  tier: 3, heat: 'cold' },
  { domain: 'flux.com',     name: 'Flux Labs',          industry: 'E-commerce',          headcount: 186, revenue: '$5M-$10M',    geography: 'United States', fundingStage: 'seed',     techStack: ['Shopify','HubSpot'],                 qualified: false,qualReason: 'E-commerce + sub-500 headcount · outside ICP',                                                              score: 28,  tier: 3, heat: 'cold' },
];

// Contacts per Tier 1/2 account — 3-4 each, mapped to roles.
interface ContactFixture {
  domain: string; // account
  fullName: string;
  title: string;
  seniority: string;
  department: string;
  email: string;
  emailStatus: 'valid' | 'risky' | 'invalid';
  role: 'decision_maker' | 'champion' | 'influencer';
  linkedinUrl: string;
}
const CONTACTS: ContactFixture[] = [
  // Cobalt AI
  { domain: 'cobalt.com', fullName: 'Noah Fischer',    title: 'CMO',                     seniority: 'C-suite',  department: 'Marketing', email: 'noah@cobalt.com',    emailStatus: 'valid', role: 'decision_maker', linkedinUrl: 'https://linkedin.com/in/noah-fischer' },
  { domain: 'cobalt.com', fullName: 'Priya Shah',      title: 'VP Demand Generation',    seniority: 'VP',       department: 'Marketing', email: 'priya@cobalt.com',   emailStatus: 'valid', role: 'champion',        linkedinUrl: 'https://linkedin.com/in/priya-shah' },
  { domain: 'cobalt.com', fullName: 'Daniel Park',     title: 'Marketing Operations Lead',seniority: 'Director', department: 'Marketing', email: 'daniel@cobalt.com',  emailStatus: 'valid', role: 'champion',        linkedinUrl: 'https://linkedin.com/in/daniel-park' },
  { domain: 'cobalt.com', fullName: 'Maya Singh',      title: 'Director of Sales',       seniority: 'Director', department: 'Sales',     email: 'maya@cobalt.com',    emailStatus: 'valid', role: 'influencer',      linkedinUrl: 'https://linkedin.com/in/maya-singh' },
  // Vertex Software
  { domain: 'vertex.com', fullName: 'Elena Rodriguez', title: 'Head of Marketing',       seniority: 'VP',       department: 'Marketing', email: 'elena@vertex.com',   emailStatus: 'valid', role: 'decision_maker', linkedinUrl: 'https://linkedin.com/in/elena-rodriguez' },
  { domain: 'vertex.com', fullName: 'Marcus Liu',      title: 'Senior Marketing Manager',seniority: 'Manager',  department: 'Marketing', email: 'marcus@vertex.com',  emailStatus: 'valid', role: 'champion',        linkedinUrl: 'https://linkedin.com/in/marcus-liu' },
  { domain: 'vertex.com', fullName: 'Iris Kim',        title: 'RevOps Lead',             seniority: 'Manager',  department: 'Operations',email: 'iris@vertex.com',    emailStatus: 'risky', role: 'influencer',      linkedinUrl: 'https://linkedin.com/in/iris-kim' },
  // Nimbus Labs
  { domain: 'nimbus.com', fullName: 'Hugo Bennett',    title: 'CMO',                     seniority: 'C-suite',  department: 'Marketing', email: 'hugo@nimbus.com',    emailStatus: 'valid', role: 'decision_maker', linkedinUrl: 'https://linkedin.com/in/hugo-bennett' },
  { domain: 'nimbus.com', fullName: 'Aiko Tanaka',     title: 'Director of Growth',      seniority: 'Director', department: 'Marketing', email: 'aiko@nimbus.com',    emailStatus: 'valid', role: 'champion',        linkedinUrl: 'https://linkedin.com/in/aiko-tanaka' },
  { domain: 'nimbus.com', fullName: 'Ryan Mathews',    title: 'Sales Enablement Manager',seniority: 'Manager',  department: 'Sales',     email: 'ryan@nimbus.com',    emailStatus: 'valid', role: 'influencer',      linkedinUrl: 'https://linkedin.com/in/ryan-mathews' },
  // Quanta Technologies
  { domain: 'quanta.com', fullName: 'Sofia Costa',     title: 'VP Marketing',            seniority: 'VP',       department: 'Marketing', email: 'sofia@quanta.com',   emailStatus: 'valid', role: 'decision_maker', linkedinUrl: 'https://linkedin.com/in/sofia-costa' },
  { domain: 'quanta.com', fullName: 'Theo Wagner',     title: 'Marketing Ops Manager',   seniority: 'Manager',  department: 'Marketing', email: 'theo@quanta.com',    emailStatus: 'valid', role: 'champion',        linkedinUrl: 'https://linkedin.com/in/theo-wagner' },
  { domain: 'quanta.com', fullName: 'Lena Brooks',     title: 'Account Executive',       seniority: 'IC',       department: 'Sales',     email: 'lena@quanta.com',    emailStatus: 'valid', role: 'influencer',      linkedinUrl: 'https://linkedin.com/in/lena-brooks' },
  // Lumen Cloud
  { domain: 'lumen.com',  fullName: 'Felix Hoffmann',  title: 'Head of Growth',          seniority: 'Director', department: 'Marketing', email: 'felix@lumen.com',    emailStatus: 'valid', role: 'decision_maker', linkedinUrl: 'https://linkedin.com/in/felix-hoffmann' },
  { domain: 'lumen.com',  fullName: 'Anya Kovac',      title: 'Demand Gen Manager',      seniority: 'Manager',  department: 'Marketing', email: 'anya@lumen.com',     emailStatus: 'valid', role: 'champion',        linkedinUrl: 'https://linkedin.com/in/anya-kovac' },
  // Pinnacle Systems
  { domain: 'pinnacle.com', fullName: 'James O\'Connor', title: 'Marketing Director',    seniority: 'Director', department: 'Marketing', email: 'james@pinnacle.com', emailStatus: 'valid', role: 'decision_maker', linkedinUrl: 'https://linkedin.com/in/james-oconnor' },
  { domain: 'pinnacle.com', fullName: 'Zoe Patel',      title: 'Content Strategist',     seniority: 'IC',       department: 'Marketing', email: 'zoe@pinnacle.com',   emailStatus: 'risky', role: 'influencer',      linkedinUrl: 'https://linkedin.com/in/zoe-patel' },
  // Apex Systems (Tier 2 - still seed contacts so the page isn't empty)
  { domain: 'apex.com',   fullName: 'David Chen',      title: 'Director of Marketing',   seniority: 'Director', department: 'Marketing', email: 'david@apex.com',     emailStatus: 'valid', role: 'decision_maker', linkedinUrl: 'https://linkedin.com/in/david-chen' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Generator: ~200 more companies on top of the 10 named heroes — gives the TAL
// real bulk for the demo. Deterministic per index so the seed stays reproducible.
// ─────────────────────────────────────────────────────────────────────────────

const PREFIX_POOL = [
  'Atlas','Aurora','Beacon','Boreal','Cascade','Cipher','Citadel','Cobalt','Compass','Cypher',
  'Datum','Delta','Echo','Ember','Eon','Forge','Fjord','Gemini','Glacier','Granite',
  'Halo','Helix','Horizon','Iris','Junction','Kepler','Krypton','Lattice','Linear','Lumen',
  'Mantle','Meridian','Mosaic','Mythos','Nexus','Nova','Onyx','Optic','Orbit','Pinnacle',
  'Polar','Prism','Pulse','Quartz','Quasar','Rapid','Ridge','Riftway','Sable','Saturn',
  'Sequoia','Sigma','Solace','Solstice','Spark','Stellar','Strata','Summit','Tempo','Terra',
  'Tessera','Threshold','Tidal','Titan','Torrent','Tundra','Umbra','Unison','Vantage','Vector',
  'Verge','Vortex','Wavelet','Westwind','Zenith','Zephyr',
];
const SUFFIX_POOL = [
  'AI','Labs','Systems','Software','Cloud','Tech','Networks','Data','Logic','Stack',
  'Wave','Sphere','Works','Dynamics','Solutions','Group','Industries','Forge','Stream','Core',
];
const ICP_INDUSTRIES   = ['Cybersecurity', 'Cloud Infrastructure', 'Information Technology', 'Software'] as const;
const OUTSIDE_INDUSTRIES = ['Manufacturing', 'E-commerce', 'Healthcare', 'Financial Services', 'Retail', 'Logistics'] as const;
const REVENUE_BANDS = ['$5M-$10M','$10M-$25M','$25M-$50M','$50M-$100M','$100M-$200M','$200M-$500M','$500M+'] as const;
const GEOS = ['United States','United Kingdom','Germany','Canada','Australia','France','Netherlands','Singapore'] as const;
const FUNDING_STAGES = ['seed','series_a','series_b','series_c','series_d','public','private'] as const;

const HERO_DOMAINS = new Set([
  'cobalt.com','vertex.com','nimbus.com','quanta.com','lumen.com',
  'pinnacle.com','apex.com','zenith.com','orbit.com','flux.com',
]);

function pseudoRand(seed: number, salt: number): number {
  // Tiny LCG for deterministic per-index variation. No Math.random — needs to
  // produce the same fixture on every seed call.
  const x = Math.sin(seed * 9301 + salt * 49297) * 10000;
  return Math.abs(x - Math.floor(x));
}

function generateAdditionalCompanies(target = 200): CompanyFixture[] {
  const out: CompanyFixture[] = [];
  const used = new Set<string>(HERO_DOMAINS);
  let prefixIdx = 0;
  let suffixIdx = 0;
  let i = 0;
  while (out.length < target && i < 5000) {
    i++;
    const prefix = PREFIX_POOL[prefixIdx % PREFIX_POOL.length];
    const suffix = SUFFIX_POOL[suffixIdx % SUFFIX_POOL.length];
    suffixIdx++;
    if (suffixIdx % SUFFIX_POOL.length === 0) prefixIdx++;
    const name = `${prefix} ${suffix}`;
    const domainBase = `${prefix.toLowerCase()}-${suffix.toLowerCase().replace(/[^a-z]/g, '')}`;
    const domain = `${domainBase}.com`;
    if (used.has(domain)) continue;
    used.add(domain);

    const seed = out.length;
    const rIndustry  = pseudoRand(seed, 1);
    const rHeadcount = pseudoRand(seed, 2);
    const rFunding   = pseudoRand(seed, 3);
    const rGeo       = pseudoRand(seed, 4);
    const rTech      = pseudoRand(seed, 5);
    const rTier      = pseudoRand(seed, 6);

    // Tier distribution: 12% T1, 22% T2, 30% T3, 36% out.
    const inIcpIndustry = rIndustry < 0.65;
    const industry = inIcpIndustry
      ? ICP_INDUSTRIES[Math.floor(rIndustry / 0.65 * ICP_INDUSTRIES.length)]
      : OUTSIDE_INDUSTRIES[Math.floor((rIndustry - 0.65) / 0.35 * OUTSIDE_INDUSTRIES.length)];
    const headcount = Math.round(80 + rHeadcount * 6000);
    const inHeadcountBand = headcount >= 500 && headcount <= 5000;
    const fundingStage = FUNDING_STAGES[Math.floor(rFunding * FUNDING_STAGES.length)];
    const goodFunding = ['series_b','series_c','series_d','public'].includes(fundingStage);
    const geography = GEOS[Math.floor(rGeo * GEOS.length)];
    const hasHubspot = rTech < 0.55;
    const techStack = [
      ...(hasHubspot ? ['HubSpot'] : []),
      ...(rTech < 0.30 ? ['Snowflake'] : []),
      ...(rTech < 0.45 ? ['AWS'] : ['GCP']),
      ...(rTech < 0.20 ? ['Datadog'] : []),
    ];
    const revenue = REVENUE_BANDS[Math.min(REVENUE_BANDS.length - 1, Math.floor(headcount / 500))];

    // Build score from criteria (mirrors the rubric).
    let score = 0;
    if (inIcpIndustry) score += 25;
    if (inHeadcountBand) score += 20;
    if (hasHubspot) score += 20;
    if (goodFunding) score += 15;
    if (techStack.includes('Snowflake') || techStack.includes('Datadog')) score += 10;
    if (['United States','United Kingdom','Germany','Canada','Australia'].includes(geography)) score += 10;
    // Add a small noise factor so scores aren't all in 5-point buckets.
    score = Math.min(100, Math.max(0, score + Math.round(rTier * 8 - 4)));

    const tier: 1 | 2 | 3 | null =
      score >= 75 ? 1 :
      score >= 50 ? 2 :
      score >= 25 ? 3 :
      null;
    const qualified = inIcpIndustry && hasHubspot;
    const heat: CompanyFixture['heat'] =
      tier === 1 && rTier > 0.6 ? 'warm' :
      tier === 1 ? 'cool' :
      tier === 2 && rTier > 0.7 ? 'cool' :
      'cold';

    out.push({
      domain,
      name,
      industry,
      headcount,
      revenue,
      geography,
      fundingStage,
      techStack,
      qualified,
      qualReason: qualified
        ? `${industry} sector match · ${headcount.toLocaleString()} employees · ${fundingStage.replace('_', ' ')}`
        : !inIcpIndustry
          ? `${industry} sector outside core ICP`
          : `Missing HubSpot in tech stack`,
      score,
      tier,
      heat,
    });
  }
  return out;
}

/** Hero companies (named, hand-crafted) + 200 generated. ~210 total. */
const ALL_COMPANIES: CompanyFixture[] = [...COMPANIES, ...generateAdditionalCompanies(200)];

// Signals — distribute by heat (hot accounts have many, cold have few or none).
const SIGNAL_TYPES = ['pricing_page_view', 'demo_clicked', 'case_study_view', 'website_visit', 'whitepaper_download', 'event_registration'] as const;

// ICP definition (a complete one — what the wizard would produce).
const DEMO_ICP = {
  firmographics: {
    industries: ['Cybersecurity', 'Cloud Infrastructure', 'Information Technology', 'Software'],
    employee_min: 500,
    employee_max: 5000,
    headcount: { min: 500, max: 5000 },
    revenue: ['$25M-$50M', '$50M-$100M', '$100M-$200M', '$200M-$500M'],
    geographies: ['United States', 'United Kingdom', 'Germany', 'Canada', 'Australia'],
    business_model: 'B2B SaaS',
    fundingStages: ['series_a', 'series_b', 'series_c', 'series_d', 'public'],
  },
  technographics: {
    required: ['HubSpot'],
    preferred: ['Salesforce', 'Snowflake', 'Datadog', 'AWS', 'GCP'],
    disqualifying: ['Marketo on Adobe Experience Cloud'],
  },
  signals: {
    trigger_events: ['new_cmo_hired', 'series_b_round', 'launched_new_product'],
    intent_topics: ['account based marketing', 'rev ops automation', 'hubspot integration'],
  },
  exclusions: {
    industries: ['Government', 'Education'],
    sub_500_headcount: true,
  },
  // Per-category confidence the ICP page renders (averages to ~0.82 overall).
  criteria_confidence: { firmographics: 0.86, technographics: 0.8, signals: 0.78, exclusions: 0.84 },
};

const ICP_CRITERIA = [
  { key: 'industry_match',     label: 'Industry match',                weight: 0.25, rationale: 'Core ICP industries: Cybersecurity, Cloud Infrastructure, IT, Software.' },
  { key: 'headcount_band',     label: 'Headcount in 500-5000 band',    weight: 0.20, rationale: 'Below 500 lacks budget; above 5000 is enterprise/different motion.' },
  { key: 'hubspot_present',    label: 'HubSpot in tech stack',         weight: 0.20, rationale: 'Integration with our platform requires HubSpot.' },
  { key: 'funding_stage',      label: 'Series B+ or public',           weight: 0.15, rationale: 'Funding signals budget readiness.' },
  { key: 'modern_data_stack',  label: 'Snowflake / Looker / Datadog',  weight: 0.10, rationale: 'Indicates data maturity our product augments.' },
  { key: 'geography',          label: 'Core geographies',              weight: 0.10, rationale: 'Where our sales motion + support cover.' },
];

const TIER_BOUNDARIES = { tier1_min: 75, tier2_min: 50, tier3_min: 25 };

// ─────────────────────────────────────────────────────────────────────────────
// Reset — wipe every demo-engine table for a workspace
// ─────────────────────────────────────────────────────────────────────────────

export async function resetDemoWorkspace(workspaceId: string): Promise<void> {
  // Wipe in reverse-dependency order. Cascades handle FK children automatically
  // (TalAccount/TalVersion cascade from TargetAccountList, IcpVersion from IcpDefinition, etc.)
  // but explicit deletes on standalone tables.
  await prisma.$transaction([
    // Engine 11 — Flywheel
    prisma.signalCorrelationData.deleteMany({ where: { workspaceId } }),
    prisma.flywheelMetric.deleteMany({ where: { workspaceId } }),
    prisma.winLossAnalysis.deleteMany({ where: { workspaceId } }),
    prisma.attributionEvent.deleteMany({ where: { workspaceId } }),
    prisma.pipelineSnapshot.deleteMany({ where: { workspaceId } }),
    // Engine 10 — CRM
    prisma.syncLog.deleteMany({ where: { workspaceId } }),
    prisma.syncJob.deleteMany({ where: { workspaceId } }),
    prisma.webhookSubscription.deleteMany({ where: { workspaceId } }),
    prisma.crmConnection.deleteMany({ where: { workspaceId } }),
    // Engine 09 — Plays
    prisma.aiDraftLog.deleteMany({ where: { workspaceId } }),
    prisma.playOutcome.deleteMany({ where: { workspaceId } }),
    prisma.playsLog.deleteMany({ where: { workspaceId } }),
    prisma.playTemplate.deleteMany({ where: { workspaceId } }),
    prisma.sequenceMapping.deleteMany({ where: { workspaceId } }),
    // Engine 08 — Awareness
    prisma.stageChangeLog.deleteMany({ where: { workspaceId } }),
    prisma.routingRuleEvaluation.deleteMany({ where: { workspaceId } }),
    prisma.routingRule.deleteMany({ where: { workspaceId } }),
    prisma.scoreSnapshot.deleteMany({ where: { workspaceId } }),
    prisma.awarenessScore.deleteMany({ where: { workspaceId } }),
    // Engine 07 — Signals
    prisma.visitorSession.deleteMany({ where: { workspaceId } }),
    prisma.trackingToken.deleteMany({ where: { workspaceId } }),
    prisma.signalSource.deleteMany({ where: { workspaceId } }),
    prisma.signal.deleteMany({ where: { workspaceId } }),
    // Engine 06 — Contacts
    prisma.sourcingJob.deleteMany({ where: { workspaceId } }),
    prisma.emailVerificationResult.deleteMany({ where: { workspaceId } }),
    prisma.stakeholderMap.deleteMany({ where: { workspaceId } }),
    prisma.contact.deleteMany({ where: { workspaceId } }),
    // Engine 05 — TAL (cascades TalAccount + TalVersion + CrmAudienceSyncLog)
    prisma.suppressionEntry.deleteMany({ where: { workspaceId } }),
    prisma.targetAccountList.deleteMany({ where: { workspaceId } }),
    // Engine 04 — Scoring
    prisma.tierOverride.deleteMany({ where: { workspaceId } }),
    prisma.scoreHistory.deleteMany({ where: { workspaceId } }),
    prisma.accountScore.deleteMany({ where: { workspaceId } }),
    prisma.scoringFormula.deleteMany({ where: { workspaceId } }),
    // Engine 03 — Enrichment
    prisma.enrichmentIcpSnapshot.deleteMany({ where: { workspaceId } }),
    prisma.qualificationResult.deleteMany({ where: { workspaceId } }),
    prisma.enrichedAccount.deleteMany({ where: { workspaceId } }),
    prisma.enrichmentJob.deleteMany({ where: { workspaceId } }),
    // Engine 02 — TAM
    prisma.rawAccount.deleteMany({ where: { workspaceId } }),
    prisma.tamBuildJob.deleteMany({ where: { workspaceId } }),
    // Engine 01 — ICP (cascades IcpVersion + IcpConfidenceHistory)
    prisma.icpDefinition.deleteMany({ where: { workspaceId } }),
  ]);
}

// ─────────────────────────────────────────────────────────────────────────────
// Seed — populate every engine for a workspace (idempotent: resets first)
// ─────────────────────────────────────────────────────────────────────────────

export interface SeedSummary {
  workspaceId: string;
  counts: Record<string, number>;
}

export async function seedDemoWorkspace(workspaceId: string): Promise<SeedSummary> {
  // 1) Reset first so reseeding gives a clean state.
  await resetDemoWorkspace(workspaceId);

  const now = new Date();
  const counts: Record<string, number> = {};
  const daysAgo = (d: number) => new Date(now.getTime() - d * 24 * 60 * 60 * 1000);

  // ── Engine 01 — ICP ──────────────────────────────────────────────────────
  const icp = await prisma.icpDefinition.create({
    data: {
      workspaceId,
      version: 1,
      mode: 'hypothesis',
      firmographics: DEMO_ICP.firmographics,
      technographics: DEMO_ICP.technographics,
      signals: DEMO_ICP.signals,
      exclusions: DEMO_ICP.exclusions,
      confidenceScore: 0.82,
      createdAt: daysAgo(28),
    },
  });
  await prisma.icpVersion.create({
    data: { icpId: icp.id, versionNumber: 1, snapshot: DEMO_ICP, createdAt: daysAgo(28) },
  });
  await prisma.icpConfidenceHistory.createMany({
    data: [
      { icpId: icp.id, confidenceScore: 0.65, recordedAt: daysAgo(28) },
      { icpId: icp.id, confidenceScore: 0.74, recordedAt: daysAgo(14) },
      { icpId: icp.id, confidenceScore: 0.82, recordedAt: daysAgo(2) },
    ],
  });
  counts.icp = 1;

  // ── Engine 02 — TAM Build ────────────────────────────────────────────────
  const tamJob = await prisma.tamBuildJob.create({
    data: {
      workspaceId,
      icpId: icp.id,
      status: 'completed',
      totalFound: ALL_COMPANIES.length,
      processed: ALL_COMPANIES.length,
      accountLimit: 1000,
      filters: DEMO_ICP.firmographics,
      startedAt: daysAgo(28),
      completedAt: daysAgo(28),
    },
  });

  await prisma.rawAccount.createMany({
    data: ALL_COMPANIES.map((c) => ({
      workspaceId,
      jobId: tamJob.id,
      domain: c.domain,
      name: c.name,
      source: 'apollo',
      createdAt: daysAgo(28),
    })),
  });
  const rawAccounts = await prisma.rawAccount.findMany({ where: { workspaceId, jobId: tamJob.id } });
  const accountByDomain = new Map(rawAccounts.map((a) => [a.domain, a]));
  counts.tam_accounts = rawAccounts.length;

  // ── Engine 03 — Enrichment ───────────────────────────────────────────────
  const enrJob = await prisma.enrichmentJob.create({
    data: {
      workspaceId,
      sourceJobId: tamJob.id,
      icpId: icp.id,
      status: 'completed',
      total: ALL_COMPANIES.length,
      enriched: ALL_COMPANIES.length,
      failed: 0,
      qualifiedCount: ALL_COMPANIES.filter((c) => c.qualified).length,
      disqualifiedCount: ALL_COMPANIES.filter((c) => !c.qualified).length,
      startedAt: daysAgo(27),
      completedAt: daysAgo(27),
    },
  });
  await prisma.enrichmentIcpSnapshot.create({
    data: {
      workspaceId,
      icpId: icp.id,
      firmographics: DEMO_ICP.firmographics,
      technographics: DEMO_ICP.technographics,
      signals: DEMO_ICP.signals,
      exclusions: DEMO_ICP.exclusions,
    },
  });
  await prisma.enrichedAccount.createMany({
    data: ALL_COMPANIES.map((c) => {
      const raw = accountByDomain.get(c.domain)!;
      return {
        workspaceId,
        jobId: enrJob.id,
        accountId: raw.id,
        domain: c.domain,
        name: c.name,
        industry: c.industry,
        headcount: c.headcount,
        revenue: c.revenue,
        geography: c.geography,
        fundingStage: c.fundingStage,
        techStack: c.techStack,
        dataQualityScore: 0.9,
        enrichmentSources: ['apollo', 'clearbit'],
        enrichedAt: daysAgo(27),
      };
    }),
  });
  // Fetch the enriched rows back — Engine 04 (scoring) keys by EnrichedAccount.id
  // (the cuid emitted in `accounts.enriched`), not RawAccount.id. Build a
  // domain→EnrichedAccount.id map for use in scoring/TAL/awareness loops below.
  const enrichedRows = await prisma.enrichedAccount.findMany({
    where: { workspaceId, jobId: enrJob.id },
    select: { id: true, accountId: true, domain: true },
  });
  const enrichedByDomain = new Map(enrichedRows.map((r) => [r.domain, r]));
  await prisma.qualificationResult.createMany({
    data: ALL_COMPANIES.map((c) => {
      const raw = accountByDomain.get(c.domain)!;
      return {
        workspaceId,
        accountId: raw.id,
        qualified: c.qualified,
        confidence: c.qualified ? 0.88 : 0.71,
        reason: c.qualReason,
        disqualifyingFactors: c.qualified ? [] : ['industry_mismatch'],
        createdAt: daysAgo(27),
      };
    }),
  });
  counts.enriched = ALL_COMPANIES.length;

  // ── Engine 04 — Scoring ──────────────────────────────────────────────────
  const formula = await prisma.scoringFormula.create({
    data: {
      workspaceId,
      icpId: icp.id,
      version: 1,
      criteria: ICP_CRITERIA,
      tierBoundaries: TIER_BOUNDARIES,
      isFallback: false,
      createdBy: 'system',
      createdAt: daysAgo(26),
    },
  });
  // Engine 04 stores EnrichedAccount.id in accountScore.accountId (because
  // accounts.enriched carries `enriched_account_ids`). Use the enriched row's id
  // here so the scoring page + TAL service can join correctly.
  await prisma.accountScore.createMany({
    data: ALL_COMPANIES.map((c) => {
      const enr = enrichedByDomain.get(c.domain)!;
      return {
        workspaceId,
        accountId: enr.id,
        formulaVersion: 1,
        totalScore: c.score,
        tier: c.tier,
        criterionScores: ICP_CRITERIA.map((cr) => ({
          key: cr.key,
          match: c.score >= 75 ? 1 : c.score >= 50 ? 0.5 : 0,
          weight: cr.weight,
          contribution: Math.round((cr.weight * c.score) * 100) / 100,
        })),
        scoredAt: daysAgo(26),
      };
    }),
  });
  await prisma.scoreHistory.createMany({
    data: ALL_COMPANIES.map((c) => {
      const enr = enrichedByDomain.get(c.domain)!;
      return { workspaceId, accountId: enr.id, score: c.score, tier: c.tier, recordedAt: daysAgo(26) };
    }),
  });
  counts.scored = ALL_COMPANIES.length;
  void formula;

  // ── Engine 05 — TAL ──────────────────────────────────────────────────────
  const tierUpCompanies = ALL_COMPANIES.filter((c) => c.tier === 1 || c.tier === 2);
  const tal = await prisma.targetAccountList.create({
    data: {
      workspaceId,
      name: 'Target Account List',
      version: 1,
      accountCount: tierUpCompanies.length,
      status: 'finalized',
      reviewStatus: 'reviewed',
      createdAt: daysAgo(25),
      updatedAt: daysAgo(25),
    },
  });
  await prisma.talAccount.createMany({
    data: tierUpCompanies.map((c) => {
      const enr = enrichedByDomain.get(c.domain)!;
      return {
        workspaceId,
        talId: tal.id,
        accountId: enr.id,
        domain: c.domain,
        name: c.name,
        tier: c.tier!,
        score: c.score,
        addedAt: daysAgo(25),
      };
    }),
  });
  await prisma.talVersion.create({
    data: {
      workspaceId,
      talId: tal.id,
      versionNumber: 1,
      snapshot: { account_count: tierUpCompanies.length, finalized_at: daysAgo(25).toISOString() },
      sourceCorrelationId: `${DEMO_TAG}_finalize_v1`,
      createdAt: daysAgo(25),
    },
  });
  counts.tal = tierUpCompanies.length;

  // ── Engine 06 — Contacts ─────────────────────────────────────────────────
  // Note: every downstream engine (06-11) keys by EnrichedAccount.id (matches the
  // production event flow: enrichment publishes `accounts.enriched` carrying
  // those ids, every downstream consumer stores them).
  const contactsByAccount = new Map<string, Array<{ id: string; role: string }>>();
  for (const c of CONTACTS) {
    const enr = enrichedByDomain.get(c.domain);
    if (!enr) continue;
    const contact = await prisma.contact.create({
      data: {
        workspaceId,
        accountId: enr.id,
        fullName: c.fullName,
        title: c.title,
        seniority: c.seniority,
        department: c.department,
        linkedinUrl: c.linkedinUrl,
        email: c.email,
        emailStatus: c.emailStatus,
        stakeholderRole: c.role,
        roleConfidence: 0.85,
        engagementScore: c.role === 'champion' ? 0.7 : 0.4,
        sourcedAt: daysAgo(20),
      },
    });
    await prisma.emailVerificationResult.create({
      data: { workspaceId, contactId: contact.id, status: c.emailStatus, bounceRisk: c.emailStatus === 'valid' ? 0.05 : 0.45 },
    });
    if (!contactsByAccount.has(enr.id)) contactsByAccount.set(enr.id, []);
    contactsByAccount.get(enr.id)!.push({ id: contact.id, role: c.role });
  }
  // Stakeholder maps for Tier 1/2 accounts
  for (const c of tierUpCompanies) {
    const enr = enrichedByDomain.get(c.domain)!;
    const list = contactsByAccount.get(enr.id) ?? [];
    if (list.length === 0) continue;
    await prisma.stakeholderMap.create({
      data: {
        workspaceId,
        accountId: enr.id,
        dmContactIds:         list.filter((x) => x.role === 'decision_maker').map((x) => x.id),
        championContactIds:   list.filter((x) => x.role === 'champion').map((x) => x.id),
        influencerContactIds: list.filter((x) => x.role === 'influencer').map((x) => x.id),
      },
    });
    await prisma.sourcingJob.create({
      data: {
        workspaceId,
        accountId: enr.id,
        tier: c.tier!,
        status: 'completed',
        contactsFound: list.length,
        startedAt: daysAgo(20),
        completedAt: daysAgo(20),
      },
    });
  }
  counts.contacts = CONTACTS.length;

  // ── Engine 07 — Signals ──────────────────────────────────────────────────
  // Tracking token
  await prisma.trackingToken.create({
    data: {
      workspaceId,
      token: `demo_${workspaceId.slice(0, 12)}_track`,
      createdAt: daysAgo(20),
    },
  });
  // Sources
  await prisma.signalSource.createMany({
    data: [
      { workspaceId, sourceType: 'website',       isActive: true },
      { workspaceId, sourceType: 'crm_webhook',   isActive: true },
      { workspaceId, sourceType: 'email_webhook', isActive: true },
    ],
  });
  // Per-account signal count by heat — only the top ~40 by heat get signals so
  // the demo data is realistic (cold accounts don't fire signals).
  const heatSignals: Record<CompanyFixture['heat'], number> = { hot: 8, warm: 5, cool: 2, cold: 0 };
  const signalData = ALL_COMPANIES.flatMap((c) => {
    const enr = enrichedByDomain.get(c.domain)!;
    const n = heatSignals[c.heat];
    return Array.from({ length: n }, (_, i) => {
      const sType = SIGNAL_TYPES[i % SIGNAL_TYPES.length];
      const source = i % 3 === 0 ? 'crm_webhook' : 'website';
      const daysOffset = Math.floor((i / Math.max(1, n)) * 12);
      return {
        workspaceId,
        accountId: enr.id,
        signalType: sType,
        signalSource: source,
        pointsAwarded: sType === 'pricing_page_view' ? 25 : sType === 'demo_clicked' ? 40 : 10,
        decayRatePerWeek: 0.1,
        pageUrl: source === 'website' ? `https://your.app/${sType.replace(/_/g, '-')}` : null,
        dedupKey: `${DEMO_TAG}_${enr.id}_${sType}_${i}`,
        occurredAt: daysAgo(daysOffset),
        receivedAt: daysAgo(daysOffset),
      };
    });
  });
  await prisma.signal.createMany({ data: signalData });
  counts.signals = signalData.length;

  // ── Engine 08 — Awareness ────────────────────────────────────────────────
  const STAGE_BY_SCORE = (s: number) =>
    s >= 80 ? 'selecting' : s >= 60 ? 'considering' : s >= 40 ? 'interested' : s >= 20 ? 'aware' : 'identified';
  const awarenessData = ALL_COMPANIES.map((c) => {
    const enr = enrichedByDomain.get(c.domain)!;
    const awScore =
      c.heat === 'hot'  ? 100 :
      c.heat === 'warm' ? 72  :
      c.heat === 'cool' ? 38  :
      18;
    const change = c.heat === 'hot' ? 24 : c.heat === 'warm' ? 12 : c.heat === 'cool' ? 4 : 0;
    return {
      workspaceId,
      accountId: enr.id,
      currentScore: awScore,
      stage: STAGE_BY_SCORE(awScore),
      score7dChange: change,
      score30dChange: change + 8,
      lastCalculatedAt: now,
      lastSignalAt: daysAgo(1),
      _change: change, _awScore: awScore,
    };
  });
  // Snapshot data — only the top warm/hot/cool accounts (cold accounts have no
  // recent signals so daily snapshots aren't realistic).
  const snapshotData = ALL_COMPANIES.filter((c) => c.heat !== 'cold').flatMap((c) => {
    const enr = enrichedByDomain.get(c.domain)!;
    const awScore = c.heat === 'hot' ? 100 : c.heat === 'warm' ? 72 : 38;
    const change = c.heat === 'hot' ? 24 : c.heat === 'warm' ? 12 : 4;
    return Array.from({ length: 4 }, (_, d) => {
      const date = daysAgo(d);
      date.setUTCHours(0, 0, 0, 0);
      return {
        workspaceId,
        accountId: enr.id,
        date,
        score: Math.max(0, awScore - d * Math.round(change / 4)),
        dominantSignalType: 'pricing_page_view',
      };
    });
  });
  // Strip helper fields before insert.
  await prisma.awarenessScore.createMany({
    data: awarenessData.map(({ _change, _awScore, ...rest }) => { void _change; void _awScore; return rest; }),
  });
  await prisma.scoreSnapshot.createMany({ data: snapshotData });
  // Routing rules
  const rule1 = await prisma.routingRule.create({
    data: {
      workspaceId,
      name: 'Hot account → SDR alert',
      isActive: true,
      triggerConfig: { min_score: 80 },
      actions: ['slack_alert', 'crm_task'],
      priority: 1,
      cooldownDays: 7,
      maxPerMonth: 4,
      createdAt: daysAgo(18),
    },
  });
  await prisma.routingRule.create({
    data: {
      workspaceId,
      name: 'Selecting stage → Exec briefing',
      isActive: true,
      triggerConfig: { stage: 'selecting' },
      actions: ['slack_alert'],
      priority: 2,
      createdAt: daysAgo(15),
    },
  });
  await prisma.routingRule.create({
    data: {
      workspaceId,
      name: 'Interested stage → Sequence enrolment',
      isActive: false,
      triggerConfig: { stage: 'interested' },
      actions: ['email_play'],
      priority: 3,
      createdAt: daysAgo(10),
    },
  });
  // Some stage-change history
  await prisma.stageChangeLog.createMany({
    data: ALL_COMPANIES.filter((x) => x.heat === 'hot' || x.heat === 'warm').map((c) => {
      const enr = enrichedByDomain.get(c.domain)!;
      return {
        workspaceId,
        accountId: enr.id,
        fromStage: 'aware',
        toStage: STAGE_BY_SCORE(c.heat === 'hot' ? 100 : 72),
        score: c.heat === 'hot' ? 100 : 72,
        changedAt: daysAgo(3),
      };
    }),
  });
  counts.awareness = ALL_COMPANIES.length;
  void rule1;

  // ── Engine 09 — Plays ────────────────────────────────────────────────────
  // Templates
  const templates: Array<{ tier: 1 | 2 | 3; stage: string; playType: string; execution: string }> = [
    { tier: 1, stage: 'selecting',   playType: 'hot_account_escalation', execution: 'crm_task_slack' },
    { tier: 1, stage: 'considering', playType: 'exec_briefing',          execution: 'crm_task' },
    { tier: 2, stage: 'interested',  playType: 'nurture_sequence',       execution: 'sequence_enrol' },
    { tier: 2, stage: 'considering', playType: 'case_study_send',        execution: 'crm_task' },
  ];
  for (const t of templates) {
    await prisma.playTemplate.create({
      data: {
        workspaceId,
        playType: t.playType,
        tier: t.tier,
        stage: t.stage,
        executionMethod: t.execution,
        templateConfig: { subject_template: `[Tier ${t.tier}] ${t.playType}`, body_template: 'Hi {{first_name}}…' },
        isActive: true,
      },
    });
  }
  // Plays log — one per hot/warm account
  let playCount = 0;
  for (const c of ALL_COMPANIES.filter((x) => x.heat === 'hot' || x.heat === 'warm')) {
    const enr = enrichedByDomain.get(c.domain)!;
    const contactList = contactsByAccount.get(enr.id) ?? [];
    const champion = contactList.find((x) => x.role === 'champion') ?? contactList[0];
    const play = await prisma.playsLog.create({
      data: {
        workspaceId,
        accountId: enr.id,
        contactId: champion?.id ?? null,
        playType: c.heat === 'hot' ? 'hot_account_escalation' : 'case_study_send',
        triggerType: 'account.stage_changed',
        executionMethod: c.heat === 'hot' ? 'crm_task_slack' : 'crm_task',
        status: 'fired',
        crmTaskId: `crm_${c.domain.replace('.', '_')}_task`,
        assignedTo: 'sdr@yourcompany.com',
        outcome: c.heat === 'hot' ? 'contacted' : null,
        correlationId: `${DEMO_TAG}_play_${c.domain}`,
        firedAt: daysAgo(c.heat === 'hot' ? 1 : 4),
      },
    });
    playCount++;
    if (c.heat === 'hot') {
      await prisma.playOutcome.create({
        data: { workspaceId, playId: play.id, outcome: 'contacted', notes: 'Reached out, scheduled discovery call.', recordedAt: daysAgo(0) },
      });
      await prisma.aiDraftLog.create({
        data: {
          workspaceId,
          playId: play.id,
          subjectLines: [
            `${c.name} — saw you on the pricing page`,
            `Quick thought after your visit`,
            `Worth 15 min? · ${c.name} × your team`,
          ],
          body: `Hi ${champion?.id ? CONTACTS.find((ct) => ct.fullName.includes('Priya'))?.fullName?.split(' ')[0] ?? 'there' : 'there'},\n\nNoticed your team has been spending time on our pricing and demo pages — usually a sign you're sizing things up.\n\nWe've helped companies like ${c.name} cut time-to-pipeline by 30%. Worth a quick call to share how?\n\nBest,\nAlex`,
          modelUsed: 'claude-haiku-4-5',
          generatedAt: daysAgo(1),
        },
      });
    }
  }
  // Sequence mappings
  await prisma.sequenceMapping.createMany({
    data: [
      { workspaceId, tier: 1, sequenceId: 'seq_t1_executive' },
      { workspaceId, tier: 2, sequenceId: 'seq_t2_nurture' },
      { workspaceId, tier: 3, sequenceId: 'seq_t3_drip' },
    ],
  });
  counts.plays = playCount;

  // ── Engine 10 — CRM Sync ─────────────────────────────────────────────────
  const conn = await prisma.crmConnection.create({
    data: {
      workspaceId,
      crmType: 'hubspot',
      accessTokenEnc: `${DEMO_TAG}_enc_access_token`,
      refreshTokenEnc: `${DEMO_TAG}_enc_refresh_token`,
      expiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
      portalId: '12345678',
      isActive: true,
      connectedAt: daysAgo(30),
    },
  });
  // Sync jobs + logs
  const syncTypes = [
    { type: 'accounts', total: tierUpCompanies.length, daysOffset: 25 },
    { type: 'contacts', total: CONTACTS.length,        daysOffset: 20 },
    { type: 'plays',    total: playCount,              daysOffset: 1 },
  ] as const;
  let syncLogCount = 0;
  for (const s of syncTypes) {
    const job = await prisma.syncJob.create({
      data: {
        workspaceId,
        syncType: s.type,
        status: 'completed',
        recordsTotal: s.total,
        recordsSynced: s.total,
        errors: 0,
        correlationId: `${DEMO_TAG}_sync_${s.type}`,
        startedAt: daysAgo(s.daysOffset),
        completedAt: daysAgo(s.daysOffset),
      },
    });
    // Per-record log entries
    const records =
      s.type === 'accounts' ? tierUpCompanies.map((c) => ({ id: enrichedByDomain.get(c.domain)!.id, name: c.name })) :
      s.type === 'contacts' ? CONTACTS.map((c, i) => ({ id: `contact_${i}`, name: c.fullName })) :
      Array.from({ length: playCount }, (_, i) => ({ id: `play_${i}`, name: `Play ${i}` }));
    for (const r of records.slice(0, Math.min(records.length, 8))) {
      await prisma.syncLog.create({
        data: {
          workspaceId,
          syncJobId: job.id,
          recordType: s.type.slice(0, -1), // accounts→account
          recordId: r.id,
          operation: 'upsert',
          outcome: 'success',
          apiResponse: { hubspot_id: `hs_${r.id.slice(0, 8)}` },
          syncedAt: daysAgo(s.daysOffset),
        },
      });
      syncLogCount++;
    }
  }
  await prisma.webhookSubscription.create({
    data: { workspaceId, crmType: 'hubspot', eventType: 'deal.closed', subscriptionId: `${DEMO_TAG}_sub_deal_closed` },
  });
  counts.crm_sync_logs = syncLogCount;
  void conn;

  // ── Engine 11 — Flywheel ─────────────────────────────────────────────────
  // Pipeline snapshots — 7 days of by-tier metrics
  for (let d = 0; d < 7; d++) {
    const date = daysAgo(d);
    date.setUTCHours(0, 0, 0, 0);
    await prisma.pipelineSnapshot.create({
      data: {
        workspaceId,
        date,
        pipelineByTier:    { 1: 240_000 + d * 8_000,  2: 165_000 + d * 4_000, 3: 80_000 },
        winRateByTier:     { 1: 0.34, 2: 0.18, 3: 0.06 },
        avgDealSizeByTier: { 1: 58_000, 2: 32_000, 3: 14_000 },
        daysToCloseByTier: { 1: 42,     2: 64,     3: 95 },
      },
    });
  }
  // Closed deals — generate a realistic VOLUME (~100 won / 200 lost) so the
  // flywheel's signal correlation (suppressed below 20 closed deals) activates
  // and the pipeline/win-rate metrics look real. Deterministic + idempotent.
  const WON_TARGET = 100;
  const LOST_TARGET = 200;
  // Weighted pools: Tier 1 accounts win most; Tier 3 / disqualified lose most.
  const repeat = (c: CompanyFixture, n: number) => Array.from({ length: n }, () => c);
  const wonPool = ALL_COMPANIES.flatMap((c) => repeat(c, c.tier === 1 ? 6 : c.tier === 2 ? 3 : 1));
  const lostPool = ALL_COMPANIES.flatMap((c) => repeat(c, c.tier === 1 ? 1 : c.tier === 2 ? 3 : 6));

  type WinLossRow = Prisma.WinLossAnalysisCreateManyInput;
  type AttrRow = Prisma.AttributionEventCreateManyInput;
  const winLossRows: WinLossRow[] = [];
  const attributionRows: AttrRow[] = [];
  const SUBTYPES = ['pricing_page_view', 'demo_clicked', 'case_study_view'];
  let dealIdx = 0;

  for (let i = 0; i < WON_TARGET; i++) {
    const c = wonPool[i % wonPool.length];
    const enr = enrichedByDomain.get(c.domain)!;
    const dealId = `${DEMO_TAG}_won_${dealIdx++}`;
    const base = c.tier === 1 ? 70_000 : c.tier === 2 ? 36_000 : 14_000;
    const amount = base + (i % 6) * 4_000;
    const days = (c.tier === 1 ? 35 : c.tier === 2 ? 55 : 80) + (i % 7);
    winLossRows.push({
      workspaceId, dealId, accountId: enr.id, outcome: 'won', amount,
      accountAttributes: { tier: c.tier, domain: c.domain, days_to_close: days, owner_id: 'sdr@yourcompany.com' },
      closedAt: daysAgo(2 + (i % 110)), analyzedAt: daysAgo(1 + (i % 110)),
    });
    // Attribution touches for the first 25 won deals (keeps insert volume sane
    // while still populating the attribution + correlation views).
    if (i < 25) {
      for (let t = 0; t < 3; t++) {
        attributionRows.push({
          workspaceId, accountId: enr.id, dealId,
          touchType: t === 2 ? 'play' : 'signal',
          touchSubtype: t === 2 ? 'hot_account_escalation' : SUBTYPES[t % SUBTYPES.length],
          weight: 1 / 3, occurredBeforePipeline: true,
          occurredAt: daysAgo(20 - t * 5), recordedAt: daysAgo(1),
        });
      }
    }
  }
  for (let i = 0; i < LOST_TARGET; i++) {
    const c = lostPool[i % lostPool.length];
    const enr = enrichedByDomain.get(c.domain)!;
    const dealId = `${DEMO_TAG}_lost_${dealIdx++}`;
    const base = c.tier === 1 ? 40_000 : c.tier === 2 ? 22_000 : 10_000;
    const amount = base + (i % 5) * 2_000;
    const days = (c.tier === 1 ? 60 : c.tier === 2 ? 80 : 100) + (i % 9);
    winLossRows.push({
      workspaceId, dealId, accountId: enr.id, outcome: 'lost', amount,
      accountAttributes: { tier: c.tier, domain: c.domain, days_to_close: days, owner_id: 'sdr@yourcompany.com' },
      closedAt: daysAgo(5 + (i % 110)), analyzedAt: daysAgo(4 + (i % 110)),
    });
  }
  await prisma.winLossAnalysis.createMany({ data: winLossRows });
  await prisma.attributionEvent.createMany({ data: attributionRows });

  // Flywheel metrics (the quick-look numbers on insights)
  await prisma.flywheelMetric.createMany({
    data: [
      { workspaceId, metricKey: 'pipeline_this_month',  value: 1_240_000, period: 'month' },
      { workspaceId, metricKey: 'win_rate_overall',     value: 0.33,      period: 'month' },
      { workspaceId, metricKey: 'avg_deal_size_overall',value: 48_000,    period: 'month' },
      { workspaceId, metricKey: 'days_to_close_avg',    value: 52,        period: 'month' },
      { workspaceId, metricKey: 'closed_won_count_qtr', value: WON_TARGET, period: 'quarter' },
    ],
  });
  // Signal correlation — now backed by 300 closed deals, so it renders.
  await prisma.signalCorrelationData.createMany({
    data: [
      { workspaceId, signalCombination: ['pricing_page_view', 'demo_clicked'],    correlationScore: 0.74, sampleSize: 180 },
      { workspaceId, signalCombination: ['demo_clicked',       'case_study_view'],correlationScore: 0.61, sampleSize: 140 },
      { workspaceId, signalCombination: ['event_registration', 'demo_clicked'],   correlationScore: 0.52, sampleSize: 95 },
    ],
  });
  counts.deals = WON_TARGET + LOST_TARGET;
  counts.attribution = attributionRows.length;

  return { workspaceId, counts };
}
