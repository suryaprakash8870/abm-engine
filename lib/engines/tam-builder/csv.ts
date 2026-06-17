/**
 * CSV upload mapping for the TAM Builder (engine 02).
 *
 * Companies exported from Apollo's web app (or any source) come in as parsed rows.
 * The user maps which column is the domain and (optionally) the company name; we
 * normalise + dedupe into account refs that flow through the same enrichment pipeline.
 */

import { normalizeDomain } from './service';

export interface CsvAccount {
  domain: string;
  name: string;
}

export interface CsvFieldMapping {
  domain: string;
  name?: string;
}

export function mapCsvRowsToAccounts(rows: Record<string, string>[], mapping: CsvFieldMapping): CsvAccount[] {
  const out: CsvAccount[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const raw = (row[mapping.domain] ?? '').trim();
    if (!raw) continue;
    const domain = normalizeDomain(raw);
    if (!domain || seen.has(domain)) continue;
    seen.add(domain);
    const name = mapping.name ? (row[mapping.name] ?? '').trim() || domain : domain;
    out.push({ domain, name });
  }
  return out;
}
