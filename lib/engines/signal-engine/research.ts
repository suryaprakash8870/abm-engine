/**
 * Signal Engine — 3rd-party research intake (Engines 03 · 07).
 *
 * Scrapes a target account's website (Firecrawl) → extracts buying signals
 * (funding, hiring surge, product launch, tech-stack change, expansion) with the
 * local LLM (Qwen via the shared router) → ingests each as a `research` signal.
 *
 * Mock-safe end to end: with no Firecrawl key the scrape is synthetic, and with
 * LLM_PROVIDER=mock the extractor uses deterministic keyword matching — so the
 * pipeline is fully testable without any paid key or credits.
 */

import { scrape, firecrawlMode } from '../../clients/firecrawl';
import { fetchCompanySignals, theirstackMode } from '../../clients/theirstack';
import { llmProvider, llmStructured, activeModelLabel } from '../../clients/llm';
import { buildResearchSignal, THIRD_PARTY_SIGNALS, type ResearchFinding, type IngestResult } from './service';

const KINDS = Object.keys(THIRD_PARTY_SIGNALS);

const FINDINGS_SCHEMA = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: KINDS },
          confidence: { type: 'number' },
          evidence: { type: 'string' },
        },
        required: ['kind', 'confidence', 'evidence'],
      },
    },
  },
  required: ['findings'],
} as const;

const SYSTEM = [
  'You are a B2B buying-signal analyst. From the scraped website content, extract',
  'concrete, recent third-party signals about the company. Only report a signal if',
  'there is clear evidence in the text. Valid kinds:',
  '- funding_round: raised capital / new investment',
  '- hiring_surge: actively hiring, especially sales/GTM/engineering at scale',
  '- product_launch: launched/announced a new product or major feature',
  '- tech_stack_change: adopted/migrated tools or platforms',
  '- expansion: new market, office, geography, or segment',
  'confidence is 0..1. evidence is a short quote or summary. Return an empty list',
  'if nothing concrete is present. Do NOT invent signals.',
].join(' ');

// ── Mock extractor (deterministic keyword match) ─────────────────────────────

const MOCK_RULES: Array<{ kind: string; re: RegExp; conf: number }> = [
  { kind: 'funding_round', re: /funding|raised|series [a-d]|seed round|investment|backed by/i, conf: 0.8 },
  { kind: 'hiring_surge', re: /hiring|careers|we'?re hiring|open roles|join our team|sdr|account executive/i, conf: 0.7 },
  { kind: 'product_launch', re: /launch|announc|new product|introducing|now available|ga release/i, conf: 0.65 },
  { kind: 'tech_stack_change', re: /migrat|adopt|powered by|built on|integrat/i, conf: 0.55 },
  { kind: 'expansion', re: /expand|new office|new market|now in|opening in/i, conf: 0.55 },
];

function mockExtract(markdown: string): ResearchFinding[] {
  const md = markdown || '';
  const out: ResearchFinding[] = [];
  for (const r of MOCK_RULES) {
    const m = md.match(r.re);
    if (m) {
      const idx = md.toLowerCase().indexOf(m[0].toLowerCase());
      const evidence = md.slice(Math.max(0, idx - 40), idx + 80).replace(/\s+/g, ' ').trim();
      out.push({ kind: r.kind, confidence: r.conf, evidence: evidence || m[0] });
    }
  }
  return out;
}

// ── Extraction ───────────────────────────────────────────────────────────────

function coerceFindings(raw: unknown): ResearchFinding[] {
  const arr = Array.isArray((raw as { findings?: unknown })?.findings) ? (raw as { findings: unknown[] }).findings : [];
  return arr
    .map((f) => f as Partial<ResearchFinding>)
    .filter((f) => typeof f.kind === 'string' && KINDS.includes(f.kind))
    .map((f) => ({
      kind: f.kind as string,
      confidence: typeof f.confidence === 'number' ? f.confidence : 0.5,
      evidence: typeof f.evidence === 'string' ? f.evidence : '',
    }));
}

async function extractFindings(markdown: string, companyName: string): Promise<ResearchFinding[]> {
  if (llmProvider() === 'mock') return mockExtract(markdown);
  try {
    const raw = await llmStructured({
      toolName: 'emit_signals',
      schema: FINDINGS_SCHEMA as unknown as Record<string, unknown>,
      system: SYSTEM,
      user: `Company: ${companyName}\n\nScraped content (markdown, truncated):\n${markdown.slice(0, 8000)}`,
      model: 'batch',
      temperature: 0.2,
    });
    return coerceFindings(raw);
  } catch (e) {
    console.error('[research] LLM extraction failed, falling back to keyword match', e instanceof Error ? e.message : e);
    return mockExtract(markdown);
  }
}

// ── Public: research one account ─────────────────────────────────────────────

export interface ResearchResult {
  scraped: boolean;
  source: 'live' | 'mock';
  modelUsed: string;
  url: string | null;
  findings: ResearchFinding[];
  /** Per-finding ingest outcomes (published / duplicate / discarded). */
  ingested: IngestResult[];
}

/**
 * Scrape → extract → ingest research signals for one TAL account. Returns a
 * summary; the caller publishes signal.received for each `published` result.
 * Never throws — degrades to an empty result on a scrape miss.
 */
export async function researchAccount(
  workspaceId: string,
  account: { accountId: string; name: string | null; domain: string | null },
): Promise<ResearchResult> {
  const base: ResearchResult = {
    scraped: false,
    source: firecrawlMode(),
    modelUsed: activeModelLabel('batch'),
    url: null,
    findings: [],
    ingested: [],
  };
  if (!account.domain) return base;

  // Source 1 — Firecrawl scrape → LLM extraction.
  const doc = await scrape(account.domain);
  const findings: ResearchFinding[] = [];
  const ingested: IngestResult[] = [];
  if (doc) {
    const extracted = await extractFindings(doc.markdown, account.name ?? account.domain);
    for (const finding of extracted) {
      findings.push(finding);
      ingested.push(await buildResearchSignal(workspaceId, account, finding, doc.url, 'firecrawl'));
    }
  }

  // Source 2 — TheirStack job postings → hiring / tech-stack signals.
  const tsSignals = await fetchCompanySignals(account.domain);
  const tsUrl = `https://theirstack.com/en/company/${account.domain}`;
  for (const s of tsSignals) {
    const finding: ResearchFinding = { kind: s.kind, confidence: s.confidence, evidence: s.evidence };
    findings.push(finding);
    ingested.push(await buildResearchSignal(workspaceId, account, finding, tsUrl, 'theirstack'));
  }

  const scraped = doc != null || tsSignals.length > 0;
  const source = doc ? (doc.mock ? 'mock' : 'live') : theirstackMode();
  return { ...base, scraped, source, url: doc?.url ?? (tsSignals.length ? tsUrl : null), findings, ingested };
}
