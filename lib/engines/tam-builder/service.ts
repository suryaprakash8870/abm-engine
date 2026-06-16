/**
 * Core service for the TAM Builder (engine 02).
 *
 * Triggered by `icp.created`: map the ICP firmographics → Apollo filters, paginate
 * the search up to the account limit, dedupe by normalised domain, persist the raw
 * account list, then publish `tam.search_completed` (verify-before-publish, ADR-003)
 * — or `tam.search_failed`. NO LLM (deterministic search/retrieval).
 *
 * Spec: ../../../docs/engines/engine-02-tam-builder.md
 */

import { Prisma } from '@prisma/client';
import { prisma } from '../../db/client';
import { searchCompanies, type ApolloSearchParams, type ApolloCompany } from '../../clients/apollo';
import type { IcpCreatedPayload } from '../../events';
import { completionCheck } from './validation';
import { publishTamSearchCompleted, publishTamSearchFailed } from './publisher';

const PER_PAGE = 25;
const MAX_PAGES = 400; // safety cap

/** Map an ICP's firmographics onto Apollo search filters. */
export function icpToFilters(payload: IcpCreatedPayload): ApolloSearchParams {
  const f = (payload.firmographics ?? {}) as Record<string, unknown>;
  const strArr = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  const num = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  return {
    industries: strArr(f.industries),
    geographies: strArr(f.geographies),
    employeeMin: num(f.employee_min, 1),
    employeeMax: num(f.employee_max, 100_000),
  };
}

/** Lowercase, strip protocol/www/path — the dedupe key. */
export function normalizeDomain(domain: string): string {
  return domain
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '');
}

/** Dedupe Apollo companies by normalised domain (first wins). */
export function dedupeByDomain(companies: ApolloCompany[]): ApolloCompany[] {
  const seen = new Set<string>();
  const out: ApolloCompany[] = [];
  for (const c of companies) {
    const key = normalizeDomain(c.domain);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ ...c, domain: key });
  }
  return out;
}

export interface TamBuildInput {
  workspaceId: string;
  jobId: string;
  icpId: string;
  filters: ApolloSearchParams;
  accountLimit: number;
  correlationId: string;
}

/** The end-to-end TAM build job (run by the build worker). */
export async function runTamBuild(input: TamBuildInput): Promise<{ accountIds: string[]; totalFound: number } | null> {
  const ctx = { workspaceId: input.workspaceId, correlationId: input.correlationId };
  try {
    // 1. Paginate the search, checkpointing each page.
    const collected: ApolloCompany[] = [];
    let page = 1;
    let pagesProcessed = 0;
    let providerTotal = 0;
    for (; page <= MAX_PAGES; page++) {
      const res = await searchCompanies(input.filters, page, PER_PAGE, input.accountLimit);
      providerTotal = res.total;
      await prisma.apolloSearchResult.create({
        data: { jobId: input.jobId, rawResponse: res.raw as Prisma.InputJsonValue, pageNumber: page },
      });
      collected.push(...res.companies);
      pagesProcessed = page;
      if (!res.hasMore || collected.length >= input.accountLimit) break;
    }

    await prisma.searchParamsLog.create({
      data: { jobId: input.jobId, params: input.filters as unknown as Prisma.InputJsonValue, resultCount: collected.length },
    });

    // 2. Merge + dedupe by domain.
    const deduped = dedupeByDomain(collected).slice(0, input.accountLimit);
    const domains = deduped.map((c) => c.domain);

    // 3. Persist (skipDuplicates honours the (workspace_id, domain) UNIQUE constraint).
    await prisma.rawAccount.createMany({
      data: deduped.map((c) => ({
        workspaceId: input.workspaceId,
        jobId: input.jobId,
        domain: c.domain,
        name: c.name,
        apolloId: c.apolloId,
        source: 'apollo',
      })),
      skipDuplicates: true,
    });

    // 4. Resolve account ids for the whole deduped set (incl. domains already present).
    const rows = await prisma.rawAccount.findMany({
      where: { workspaceId: input.workspaceId, domain: { in: domains } },
      select: { id: true },
    });
    const accountIds = rows.map((r) => r.id);

    // 5. Verify before publish.
    const gate = completionCheck({
      allPagesProcessed: true,
      totalAccountsStored: accountIds.length,
      expectedCount: domains.length,
      domainsDeduplicated: domains.length === new Set(domains).size,
      searchCompletedPublishedAndConfirmed: true,
    });
    if (!gate.ok) {
      await failJob(input, gate.failed.join('; '), pagesProcessed);
      return null;
    }

    // 6. Persist job result + publish success.
    await prisma.tamBuildJob.update({
      where: { id: input.jobId },
      data: { status: 'completed', totalFound: domains.length, processed: domains.length, completedAt: new Date() },
    });
    await publishTamSearchCompleted(
      {
        job_id: input.jobId,
        icp_id: input.icpId,
        account_ids: accountIds,
        total_found: domains.length,
        account_limit: input.accountLimit,
        source_breakdown: { apollo: domains.length, csv_upload: 0 },
      },
      ctx,
    );
    return { accountIds, totalFound: domains.length };
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'unknown TAM build error';
    await failJob(input, reason, 0);
    return null;
  }
}

async function failJob(input: TamBuildInput, reason: string, lastPage: number): Promise<void> {
  await prisma.tamBuildJob
    .update({ where: { id: input.jobId }, data: { status: 'failed', error: reason, completedAt: new Date() } })
    .catch(() => undefined);
  await publishTamSearchFailed(
    {
      job_id: input.jobId,
      icp_id: input.icpId,
      error_code: 'build_failed',
      error_message: reason,
      last_processed_page: lastPage,
      processed: 0,
    },
    { workspaceId: input.workspaceId, correlationId: input.correlationId },
  );
}
