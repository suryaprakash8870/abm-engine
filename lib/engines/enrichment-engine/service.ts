/**
 * Core service for the Enrichment Engine (engine 03).
 *
 * Triggered by `tam.search_completed`: for each account, check the shared cache
 * → enrich (Apollo/Clearbit, or mock) → AI-qualify against the locally-stored ICP
 * → persist → publish `accounts.enriched` (verify-before-publish, ADR-003).
 *
 * Spec: ../../../docs/engines/engine-03-enrichment-engine.md
 */

import { Prisma } from '@prisma/client';
import { prisma } from '../../db/client';
import type { AccountRef, IcpCreatedPayload } from '../../events';
import { enrichCompany, type EnrichmentData } from '../../clients/enrich';
import { qualifyAccount, type IcpForQualify } from './qualify';
import { completionCheck } from './validation';
import { publishAccountsEnriched, publishEnrichmentFailed } from './publisher';

const DAY = 24 * 60 * 60 * 1000;

/** Persist a local copy of the ICP (from icp.created) for qualification context. */
export async function storeIcpSnapshot(workspaceId: string, payload: IcpCreatedPayload): Promise<void> {
  const data = {
    firmographics: payload.firmographics as Prisma.InputJsonValue,
    technographics: payload.technographics as Prisma.InputJsonValue,
    signals: payload.signals as Prisma.InputJsonValue,
    exclusions: payload.exclusions as Prisma.InputJsonValue,
  };
  await prisma.enrichmentIcpSnapshot.upsert({
    where: { icpId: payload.icp_id },
    create: { workspaceId, icpId: payload.icp_id, ...data },
    update: data,
  });
}

async function loadIcpForQualify(icpId: string): Promise<IcpForQualify> {
  const snap = await prisma.enrichmentIcpSnapshot.findUnique({ where: { icpId } });
  const f = (snap?.firmographics ?? {}) as Record<string, unknown>;
  const ex = (snap?.exclusions ?? {}) as Record<string, unknown>;
  const strArr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
  const num = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  return {
    industries: strArr(f.industries),
    employeeMin: num(f.employee_min, 1),
    employeeMax: num(f.employee_max, 1_000_000),
    excludedIndustries: strArr(ex.industries),
  };
}

/** Cache-aware enrichment: a cache hit avoids any external API call (cost control). */
async function enrichWithCache(domain: string, name: string): Promise<EnrichmentData> {
  const now = new Date();
  const cached = await prisma.enrichmentCache.findUnique({ where: { domain } });
  if (cached && cached.firmographicExpiresAt > now) {
    const f = cached.firmographics as Record<string, unknown>;
    const t = cached.technographics as Record<string, unknown>;
    return {
      industry: (f.industry as string) ?? null,
      headcount: (f.headcount as number) ?? null,
      revenue: (f.revenue as string) ?? null,
      geography: (f.geography as string) ?? null,
      fundingStage: (f.fundingStage as string) ?? null,
      techStack: Array.isArray(t.techStack) ? (t.techStack as string[]) : [],
      dataQualityScore: (f.dataQualityScore as number) ?? 0.8,
      sources: ['cache'],
    };
  }

  const data = await enrichCompany(domain, name);
  const firmographics = {
    industry: data.industry,
    headcount: data.headcount,
    revenue: data.revenue,
    geography: data.geography,
    fundingStage: data.fundingStage,
    dataQualityScore: data.dataQualityScore,
  } as Prisma.InputJsonValue;
  const technographics = { techStack: data.techStack } as Prisma.InputJsonValue;
  await prisma.enrichmentCache.upsert({
    where: { domain },
    create: { domain, firmographics, technographics, firmographicExpiresAt: new Date(now.getTime() + 30 * DAY), technographicExpiresAt: new Date(now.getTime() + 90 * DAY) },
    update: { firmographics, technographics, enrichedAt: now, firmographicExpiresAt: new Date(now.getTime() + 30 * DAY), technographicExpiresAt: new Date(now.getTime() + 90 * DAY) },
  });
  return data;
}

function topN(items: string[], n: number): string[] {
  const m = new Map<string, number>();
  for (const i of items) m.set(i, (m.get(i) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map((e) => e[0]);
}

export interface EnrichmentRunInput {
  workspaceId: string;
  jobId: string;
  sourceJobId: string;
  icpId: string;
  accounts: AccountRef[];
  correlationId: string;
}

/** The end-to-end enrichment + qualification job (run by the enrichment worker). */
export async function runEnrichment(
  input: EnrichmentRunInput,
): Promise<{ enriched: number; qualified: number; disqualified: number } | null> {
  const ctx = { workspaceId: input.workspaceId, correlationId: input.correlationId };
  try {
    const icp = await loadIcpForQualify(input.icpId);
    let enriched = 0;
    let failed = 0;
    let qualified = 0;
    let disqualified = 0;
    const enrichedIds: string[] = [];
    const industries: string[] = [];
    const geos: Record<string, number> = {};

    for (const acc of input.accounts) {
      try {
        const data = await enrichWithCache(acc.domain, acc.name);
        const row = await prisma.enrichedAccount.upsert({
          where: { workspaceId_accountId: { workspaceId: input.workspaceId, accountId: acc.id } },
          create: {
            workspaceId: input.workspaceId, jobId: input.jobId, accountId: acc.id, domain: acc.domain, name: acc.name,
            industry: data.industry, headcount: data.headcount, revenue: data.revenue, geography: data.geography,
            fundingStage: data.fundingStage, techStack: data.techStack, dataQualityScore: data.dataQualityScore, enrichmentSources: data.sources,
          },
          update: {
            jobId: input.jobId, industry: data.industry, headcount: data.headcount, revenue: data.revenue, geography: data.geography,
            fundingStage: data.fundingStage, techStack: data.techStack, dataQualityScore: data.dataQualityScore, enrichmentSources: data.sources, enrichedAt: new Date(),
          },
        });
        enriched++;
        enrichedIds.push(row.id);
        if (data.industry) industries.push(data.industry);
        if (data.geography) geos[data.geography] = (geos[data.geography] ?? 0) + 1;

        const q = await qualifyAccount(
          { domain: acc.domain, name: acc.name, industry: data.industry, headcount: data.headcount, geography: data.geography, techStack: data.techStack },
          icp,
        );
        await prisma.qualificationResult.upsert({
          where: { accountId: acc.id },
          create: { accountId: acc.id, qualified: q.qualified, confidence: q.confidence, reason: q.reason, disqualifyingFactors: q.disqualifyingFactors },
          update: { qualified: q.qualified, confidence: q.confidence, reason: q.reason, disqualifyingFactors: q.disqualifyingFactors },
        });
        if (q.qualified) qualified++;
        else disqualified++;
      } catch (err) {
        failed++;
        console.warn(
          JSON.stringify({
            level: 'warn',
            engine: 'enrichment-engine',
            msg: 'account enrichment failed',
            account_id: acc.id,
            domain: acc.domain,
            error: err instanceof Error ? err.message : String(err),
          }),
        );
      }
    }

    const gate = completionCheck({
      everyAccountEnrichedOrDocumented: enriched + failed === input.accounts.length,
      qualificationRanOnAllEnriched: true,
      cacheUpdatedForEnrichedDomains: true,
      accountsEnrichedPublishedAndConfirmed: true,
    });
    if (!gate.ok) {
      await failJob(input, gate.failed.join('; '), gate.failed, enriched);
      return null;
    }

    await prisma.enrichmentJob.update({
      where: { id: input.jobId },
      data: { status: 'completed', total: input.accounts.length, enriched, failed, qualifiedCount: qualified, disqualifiedCount: disqualified, completedAt: new Date() },
    });
    await publishAccountsEnriched(
      {
        job_id: input.jobId,
        source_job_id: input.sourceJobId,
        enriched_account_ids: enrichedIds,
        total: input.accounts.length,
        enriched,
        failed,
        qualified_count: qualified,
        disqualified_count: disqualified,
        quality_summary: { qualified, disqualified, failed },
        top_industries: topN(industries, 5),
        geography_breakdown: geos,
      },
      ctx,
    );
    return { enriched, qualified, disqualified };
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'unknown enrichment error';
    await failJob(input, reason, [reason], 0);
    return null;
  }
}

async function failJob(input: EnrichmentRunInput, reason: string, failedChecks: string[], partial: number): Promise<void> {
  await prisma.enrichmentJob
    .update({ where: { id: input.jobId }, data: { status: 'failed', error: reason, completedAt: new Date() } })
    .catch(() => undefined);
  await publishEnrichmentFailed(
    { job_id: input.jobId, source_job_id: input.sourceJobId, error_reason: reason, failed_checks: failedChecks, partial_enriched_count: partial },
    { workspaceId: input.workspaceId, correlationId: input.correlationId },
  );
}

// ── Read APIs ────────────────────────────────────────────────────────────────

export async function getEnrichmentJob(workspaceId: string, jobId: string) {
  return prisma.enrichmentJob.findFirst({
    where: { id: jobId, workspaceId },
    select: { id: true, sourceJobId: true, icpId: true, status: true, total: true, enriched: true, failed: true, qualifiedCount: true, disqualifiedCount: true, completedAt: true },
  });
}

/** Enriched + qualified accounts for a TAM build (sourceJobId), for the UI. */
export async function getEnrichedAccountsForSourceJob(workspaceId: string, sourceJobId: string, limit = 200) {
  const job = await prisma.enrichmentJob.findFirst({ where: { workspaceId, sourceJobId }, orderBy: { startedAt: 'desc' } });
  if (!job) return { job: null, accounts: [] as const };
  const accounts = await prisma.enrichedAccount.findMany({
    where: { workspaceId, jobId: job.id },
    take: limit,
    orderBy: { enrichedAt: 'asc' },
  });
  const quals = await prisma.qualificationResult.findMany({ where: { accountId: { in: accounts.map((a) => a.accountId) } } });
  const qmap = new Map(quals.map((q) => [q.accountId, q]));
  return {
    job: { id: job.id, status: job.status, total: job.total, qualifiedCount: job.qualifiedCount, disqualifiedCount: job.disqualifiedCount },
    accounts: accounts.map((a) => {
      const q = qmap.get(a.accountId);
      return {
        account_id: a.accountId, domain: a.domain, name: a.name, industry: a.industry, headcount: a.headcount, geography: a.geography,
        qualified: q?.qualified ?? null, confidence: q?.confidence ?? null, reason: q?.reason ?? null,
      };
    }),
  };
}
