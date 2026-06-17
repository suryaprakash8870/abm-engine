/**
 * AI qualification — does this enriched account fit the ICP?
 *
 * Production (per the doc) batches this through Claude Haiku (50/call). For free,
 * fast, deterministic testing we use an explainable rule-based judge over the
 * enriched firmographics vs the ICP (industry match · size range · exclusions).
 * The LLM-batch path is a documented TODO.
 */

export interface IcpForQualify {
  industries: string[];
  employeeMin: number;
  employeeMax: number;
  excludedIndustries: string[];
}

export interface AccountForQualify {
  domain: string;
  name: string;
  industry: string | null;
  headcount: number | null;
  geography: string | null;
  techStack: string[];
}

export interface QualifyResult {
  qualified: boolean;
  confidence: number;
  reason: string;
  disqualifyingFactors: string[];
}

export function qualifyRuleBased(account: AccountForQualify, icp: IcpForQualify): QualifyResult {
  const factors: string[] = [];
  const industry = (account.industry ?? '').toLowerCase();
  const icpIndustries = icp.industries.map((s) => s.toLowerCase());
  const excluded = icp.excludedIndustries.map((s) => s.toLowerCase());

  const industryMatch =
    icpIndustries.length === 0 ||
    !!industry && icpIndustries.some((i) => industry.includes(i) || i.includes(industry));
  const excludedIndustry = !!industry && excluded.some((i) => industry.includes(i) || i.includes(industry));
  const headcount = account.headcount ?? 0;
  const sizeOk = headcount >= icp.employeeMin && headcount <= icp.employeeMax;

  if (excludedIndustry) factors.push(`Excluded industry: ${account.industry}`);
  if (!industryMatch) factors.push(`Industry "${account.industry ?? 'unknown'}" not in ICP`);
  if (!sizeOk) factors.push(`Headcount ${headcount} outside ${icp.employeeMin}–${icp.employeeMax}`);

  const qualified = industryMatch && sizeOk && !excludedIndustry;
  const score = (industryMatch ? 1 : 0) + (sizeOk ? 1 : 0) + (!excludedIndustry ? 1 : 0);
  const confidence = Math.round((score / 3) * 100) / 100;
  const reason = qualified
    ? `Fits ICP — ${account.industry}, ${headcount} employees.`
    : `Disqualified — ${factors.join('; ')}.`;

  return { qualified, confidence, reason, disqualifyingFactors: factors };
}

/** Qualify one account against the ICP. (Rule-based now; Claude Haiku batch in production.) */
export async function qualifyAccount(account: AccountForQualify, icp: IcpForQualify): Promise<QualifyResult> {
  return qualifyRuleBased(account, icp);
}
