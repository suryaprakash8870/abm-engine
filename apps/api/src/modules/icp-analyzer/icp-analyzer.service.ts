import { Injectable } from '@nestjs/common';
import { parse } from 'csv-parse/sync';

// ─── Column detection ──────────────────────────────────────────────────────────
// Maps semantic field names → possible CSV column header variations (case-insensitive).
const COLUMN_ALIASES: Record<string, string[]> = {
  name: ['name', 'company', 'company_name', 'account', 'account_name', 'organization', 'org'],
  industry: ['industry', 'sector', 'vertical', 'company_industry', 'naics', 'market'],
  employees: [
    'employees', 'employee_count', 'headcount', 'staff', 'size', 'num_employees',
    'numberofemployees', 'number_of_employees', 'company_size',
  ],
  country: ['country', 'location', 'hq_country', 'headquarters', 'region', 'geo'],
  revenue: ['revenue', 'arr', 'mrr', 'annual_revenue', 'company_revenue', 'yearly_revenue'],
  website: ['website', 'domain', 'url', 'web', 'homepage', 'site'],
  won: [
    'won', 'closed_won', 'status', 'deal_status', 'outcome', 'result',
    'converted', 'customer', 'is_customer', 'closed',
  ],
  technology: ['technology', 'tech', 'tech_stack', 'tools', 'crm', 'platform'],
};

// Values that mean "this is a won / closed deal" in the `won` column
const WON_VALUES = new Set([
  'won', 'closed won', 'closed_won', 'true', '1', 'yes', 'customer',
  'converted', 'active', 'churned', // churned customers still reveal ICP
]);

// Employee count bands (mirroring ScoringService)
const EMPLOYEE_BANDS = [
  { label: '1–10',      min: 1,    max: 10 },
  { label: '11–50',     min: 11,   max: 50 },
  { label: '51–200',    min: 51,   max: 200 },
  { label: '201–500',   min: 201,  max: 500 },
  { label: '501–1000',  min: 501,  max: 1000 },
  { label: '1001–5000', min: 1001, max: 5000 },
  { label: '5000+',     min: 5001, max: Infinity },
];

export type ColumnMap = Record<string, string | null>; // semantic → raw header

export type FreqEntry = { value: string; count: number; pct: number };

export type PatternField = {
  field: string;           // semantic name
  rawColumn: string;       // CSV column header
  topValues: FreqEntry[];  // sorted by frequency
  insight: string;         // human-readable takeaway
};

export type DerivedRule = {
  field: string;
  match: string | string[];   // value(s) that score points
  points: number;
  reason: string;
};

export type AnalysisResult = {
  totalRows: number;
  wonRows: number;
  columnMap: ColumnMap;
  unmappedColumns: string[];
  patterns: PatternField[];
  derivedRules: DerivedRule[];  // rubric auto-derived from patterns
};

export type ScoredProspect = {
  name: string;
  domain: string;
  industry: string | null;
  employees: string | null;
  country: string | null;
  fitScore: number;
  tier: 1 | 2 | 3 | null;
  breakdown: Array<{ field: string; value: string; points: number; reason: string }>;
};

@Injectable()
export class IcpAnalyzerService {

  // ── 1. Parse CSV + detect column mapping ─────────────────────────────────

  parseRows(buffer: Buffer): Record<string, string>[] {
    return parse(buffer, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
    }) as Record<string, string>[];
  }

  detectColumns(headers: string[]): { map: ColumnMap; unmapped: string[] } {
    const lower = headers.map((h) => h.toLowerCase().trim());
    const map: ColumnMap = {};
    const usedRaw = new Set<string>();

    for (const [semantic, aliases] of Object.entries(COLUMN_ALIASES)) {
      let found: string | null = null;
      for (const alias of aliases) {
        const idx = lower.indexOf(alias);
        if (idx !== -1 && !usedRaw.has(headers[idx])) {
          found = headers[idx];
          usedRaw.add(headers[idx]);
          break;
        }
      }
      map[semantic] = found;
    }

    const unmapped = headers.filter((h) => !usedRaw.has(h));
    return { map, unmapped };
  }

  // ── 2. Analyze patterns from "won" rows ──────────────────────────────────

  analyzeWonData(buffer: Buffer): AnalysisResult {
    const rows = this.parseRows(buffer);
    if (rows.length === 0) throw new Error('CSV is empty or has no parseable rows');

    const headers = Object.keys(rows[0]);
    const { map, unmapped } = this.detectColumns(headers);

    // Filter to won rows — if no won column, treat all rows as won
    const wonRows = map.won
      ? rows.filter((r) => WON_VALUES.has((r[map.won!] ?? '').toLowerCase().trim()))
      : rows;

    const patterns: PatternField[] = [];

    for (const field of ['industry', 'country', 'employees', 'revenue', 'technology']) {
      const rawCol = map[field];
      if (!rawCol) continue;

      const values = wonRows.map((r) => {
        const v = (r[rawCol] ?? '').trim();
        if (field === 'employees') return this.bucketEmployees(v);
        return v || '(blank)';
      });

      const freq = this.frequency(values);
      const topValues = freq.slice(0, 6);
      if (topValues.length === 0) continue;

      patterns.push({
        field,
        rawColumn: rawCol,
        topValues,
        insight: this.buildInsight(field, topValues, wonRows.length),
      });
    }

    const derivedRules = this.deriveRules(patterns, wonRows.length);

    return {
      totalRows: rows.length,
      wonRows: wonRows.length,
      columnMap: map,
      unmappedColumns: unmapped,
      patterns,
      derivedRules,
    };
  }

  // ── 3. Score new prospects against derived rules ──────────────────────────

  scoreProspects(
    buffer: Buffer,
    rules: DerivedRule[],
  ): ScoredProspect[] {
    const rows = this.parseRows(buffer);
    if (rows.length === 0) return [];

    const headers = Object.keys(rows[0]);
    const { map } = this.detectColumns(headers);

    const maxPoints = rules.reduce((s, r) => s + r.points, 0) || 100;
    const TIER_THRESHOLDS = { t1: 0.75, t2: 0.5, t3: 0.25 };

    return rows.map((row) => {
      const industry = map.industry ? (row[map.industry] ?? '').trim() : null;
      const empRaw = map.employees ? (row[map.employees] ?? '').trim() : null;
      const employees = empRaw ? this.bucketEmployees(empRaw) : null;
      const country = map.country ? (row[map.country] ?? '').trim() : null;
      const name = map.name ? (row[map.name] ?? '').trim() : '(unknown)';
      const website = map.website ? (row[map.website] ?? '').trim() : null;
      const domain = website || this.guessDomain(name);
      const tech = map.technology ? (row[map.technology] ?? '').trim() : null;

      const breakdown: ScoredProspect['breakdown'] = [];
      let totalPoints = 0;

      for (const rule of rules) {
        const cellValue = this.getValueForField(
          rule.field, { industry, employees, country, technology: tech },
        );
        const matches = Array.isArray(rule.match)
          ? rule.match.map((m) => m.toLowerCase()).includes((cellValue ?? '').toLowerCase())
          : (cellValue ?? '').toLowerCase() === rule.match.toLowerCase();

        const pts = matches ? rule.points : 0;
        totalPoints += pts;
        breakdown.push({
          field: rule.field,
          value: cellValue ?? '(missing)',
          points: pts,
          reason: matches ? rule.reason : `"${cellValue}" not in top ICP segment`,
        });
      }

      const pct = totalPoints / maxPoints;
      const tier: 1 | 2 | 3 | null =
        pct >= TIER_THRESHOLDS.t1 ? 1 :
        pct >= TIER_THRESHOLDS.t2 ? 2 :
        pct >= TIER_THRESHOLDS.t3 ? 3 :
        null;

      return {
        name,
        domain,
        industry,
        employees: empRaw,
        country,
        fitScore: Math.round((totalPoints / maxPoints) * 100),
        tier,
        breakdown,
      };
    }).sort((a, b) => b.fitScore - a.fitScore);
  }

  // ── 4. Analyze patterns from LIVE CRM deals (Playbook Step 1) ─────────────

  /**
   * Same pattern analysis as the CSV path, but fed by closed-won deals pulled
   * straight from the CRM — plus the revenue metrics the playbook calls for
   * (ACV, sales-cycle length, win rate) that a flat account CSV can't show.
   */
  analyzeDeals(
    deals: Array<{
      amount?: number;
      isClosedWon: boolean;
      isClosedLost: boolean;
      createdAt?: string;
      closedAt?: string;
      accountExternalIds: string[];
    }>,
    accountsByExternalId: Map<
      string,
      { industry?: string | null; employees?: string | number | null; country?: string | null }
    >,
  ): {
    dealStats: {
      total: number;
      won: number;
      lost: number;
      winRate: number;
      avgAcv: number | null;
      avgSalesCycleDays: number | null;
    };
    patterns: PatternField[];
    derivedRules: DerivedRule[];
  } {
    const won = deals.filter((d) => d.isClosedWon);
    const lost = deals.filter((d) => d.isClosedLost);

    const amounts = won.map((d) => d.amount).filter((a): a is number => typeof a === 'number');
    const cycles = won
      .map((d) =>
        d.createdAt && d.closedAt
          ? (new Date(d.closedAt).getTime() - new Date(d.createdAt).getTime()) / 86_400_000
          : null,
      )
      .filter((c): c is number => c !== null && c >= 0);

    // Build pseudo-rows from the accounts behind won deals, then reuse the
    // same frequency → insight → rules machinery as the CSV path.
    const wonAccountRows: Array<Record<string, string>> = [];
    for (const deal of won) {
      for (const extId of deal.accountExternalIds) {
        const acc = accountsByExternalId.get(extId);
        if (!acc) continue;
        wonAccountRows.push({
          industry: String(acc.industry ?? ''),
          employees: String(acc.employees ?? ''),
          country: String(acc.country ?? ''),
        });
      }
    }

    const patterns: PatternField[] = [];
    for (const field of ['industry', 'country', 'employees'] as const) {
      const values = wonAccountRows.map((r) => {
        const v = (r[field] ?? '').trim();
        if (field === 'employees') return this.bucketEmployees(v);
        return v || '(blank)';
      });
      const freq = this.frequency(values);
      const topValues = freq.slice(0, 6);
      if (topValues.length === 0) continue;
      patterns.push({
        field,
        rawColumn: `crm:${field}`,
        topValues,
        insight: this.buildInsight(field, topValues, wonAccountRows.length),
      });
    }

    return {
      dealStats: {
        total: deals.length,
        won: won.length,
        lost: lost.length,
        winRate:
          won.length + lost.length > 0
            ? Math.round((won.length / (won.length + lost.length)) * 100)
            : 0,
        avgAcv: amounts.length > 0 ? Math.round(amounts.reduce((s, a) => s + a, 0) / amounts.length) : null,
        avgSalesCycleDays: cycles.length > 0 ? Math.round(cycles.reduce((s, c) => s + c, 0) / cycles.length) : null,
      },
      patterns,
      derivedRules: this.deriveRules(patterns, wonAccountRows.length),
    };
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private frequency(values: string[]): FreqEntry[] {
    const counts: Record<string, number> = {};
    for (const v of values) counts[v] = (counts[v] ?? 0) + 1;
    const total = values.length || 1;
    return Object.entries(counts)
      .filter(([v]) => v && v !== '(blank)')
      .sort((a, b) => b[1] - a[1])
      .map(([value, count]) => ({ value, count, pct: Math.round((count / total) * 100) }));
  }

  private bucketEmployees(raw: string): string {
    const n = parseInt(raw.replace(/[^0-9]/g, ''), 10);
    if (isNaN(n)) return raw || '(blank)';
    const band = EMPLOYEE_BANDS.find((b) => n >= b.min && n <= b.max);
    return band?.label ?? '5000+';
  }

  private buildInsight(field: string, top: FreqEntry[], total: number): string {
    const top3 = top.slice(0, 3);
    const combined = top3.reduce((s, e) => s + e.pct, 0);
    if (field === 'industry') {
      return `${combined}% of your won customers are in: ${top3.map((e) => e.value).join(', ')}`;
    }
    if (field === 'employees') {
      return `${top[0]?.pct ?? 0}% of won customers have ${top[0]?.value ?? '?'} employees`;
    }
    if (field === 'country') {
      return `${combined}% of won customers are in: ${top3.map((e) => e.value).join(', ')}`;
    }
    return `Top value: ${top[0]?.value ?? '?'} (${top[0]?.pct ?? 0}%)`;
  }

  /**
   * Convert frequency patterns → rubric rules.
   * Points are proportional to how dominant each value is in won accounts.
   * Total points across all rules = 100.
   */
  private deriveRules(patterns: PatternField[], totalWon: number): DerivedRule[] {
    if (patterns.length === 0) return [];

    // Allocate a point budget per field, weighted by how predictive it seems
    const FIELD_WEIGHTS: Record<string, number> = {
      industry: 30,
      employees: 25,
      country: 20,
      revenue: 15,
      technology: 10,
    };

    const rules: DerivedRule[] = [];

    for (const pattern of patterns) {
      const budget = FIELD_WEIGHTS[pattern.field] ?? 10;
      const top = pattern.topValues.slice(0, 3); // top 3 values qualify
      if (top.length === 0) continue;

      // Give full budget to matching any of the top-3 values
      rules.push({
        field: pattern.field,
        match: top.map((e) => e.value),
        points: budget,
        reason: `${pattern.field} matches top ICP segment (${top.map((e) => `${e.value} ${e.pct}%`).join(', ')})`,
      });
    }

    return rules;
  }

  private getValueForField(
    field: string,
    ctx: { industry: string | null; employees: string | null; country: string | null; technology: string | null },
  ): string | null {
    if (field === 'industry') return ctx.industry;
    if (field === 'employees') return ctx.employees;
    if (field === 'country') return ctx.country;
    if (field === 'technology') return ctx.technology;
    return null;
  }

  private guessDomain(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9]/g, '') + '.com';
  }
}
