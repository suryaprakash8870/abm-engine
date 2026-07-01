/**
 * Business → draft wizard answers.
 *
 * Turns a website URL or a freeform business description into a DRAFT set of the
 * 12 ICP-wizard answers, so the wizard can pre-fill instead of cold-asking. The
 * user reviews + edits the drafts before synthesis. This is the "paste your site,
 * AI fills it in" intake step.
 *
 * When the input is a URL/domain we CRAWL the site (Firecrawl) and ground the
 * draft in the page's real content — otherwise the LLM only sees the text you
 * typed and guesses from it (e.g. a name like "kraftylumin" → "lumin" → lighting).
 * No URL, or a failed/empty crawl → we fall back to inference from the input.
 *
 * FREE TESTING: with the LLM in mock mode (ICP_LLM=mock / no key) it returns a
 * deterministic draft so the flow works offline. Firecrawl has its own mock mode.
 */

import { llmProvider, llmStructured } from '../../clients/llm';
import { scrape, type ScrapeResult } from '../../clients/firecrawl';
import { WIZARD_QUESTIONS, type WizardAnswers } from './types';

const TOOL_NAME = 'emit_wizard_answers';

/** JSON schema: one string per wizard question id. */
const ANSWERS_SCHEMA: Record<string, unknown> = {
  type: 'object',
  required: WIZARD_QUESTIONS.map((q) => q.id),
  properties: Object.fromEntries(
    WIZARD_QUESTIONS.map((q) => [q.id, { type: 'string', description: q.prompt }]),
  ),
};

const SYSTEM_INFER =
  'You are a B2B go-to-market strategist. Given a company website URL or a ' +
  'freeform description of a business, infer concise, realistic DRAFT answers to ' +
  '12 questions used to build an Ideal Customer Profile. Keep each answer to one ' +
  'short phrase or sentence. If the input is only a URL, infer from the likely ' +
  'company. These are drafts the user will review and edit — be specific and ' +
  'plausible, do not over-claim, and never leave an answer blank.';

const SYSTEM_FROM_SITE =
  'You are a B2B go-to-market strategist. Below is real content scraped from a ' +
  "company's own website. Infer concise, realistic DRAFT answers to 12 questions " +
  'used to build an Ideal Customer Profile, GROUNDED in what the website actually ' +
  'says. Base every answer on the provided content; only infer what the site does ' +
  'not state, and never contradict it or invent products, industries, or services ' +
  'it does not mention. Keep each answer to one short phrase or sentence, and never ' +
  'leave one blank.';

// qwen2.5:3b is slow on long inputs, and the interactive intake waits on this call.
// The homepage's first few KB (hero + product blurbs) is where the "what/who" lives;
// cap there so the draft stays grounded but the call returns in a reasonable time.
const MAX_SITE_CHARS = 3200;

/**
 * Return the input as a crawlable URL only when the WHOLE input is a URL/domain
 * (anchored) — not a prose description that merely mentions one, which would make
 * us crawl an example domain from a sentence. A bare name with no TLD → null.
 */
function urlFromInput(input: string): string | null {
  const trimmed = input.trim();
  return /^(?:https?:\/\/)?(?:www\.)?[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]{2,})+(?:\/\S*)?$/i.test(trimmed)
    ? trimmed
    : null;
}

/** Scrape a URL, but never let a slow site block the interactive intake. */
async function scrapeWithTimeout(url: string, ms = 12_000): Promise<ScrapeResult | null> {
  try {
    return await Promise.race([
      scrape(url),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
    ]);
  } catch {
    return null;
  }
}

/** Pack the scraped page into a compact context block for the LLM. */
function siteContext(site: ScrapeResult): string {
  return [
    `Website: ${site.url}`,
    site.title ? `Page title: ${site.title}` : '',
    site.description ? `Meta description: ${site.description}` : '',
    '',
    'Website content (markdown):',
    site.markdown.slice(0, MAX_SITE_CHARS),
  ]
    .filter(Boolean)
    .join('\n');
}

/** Deterministic offline draft so the intake works with no API key. */
function mockAnswers(input: string): WizardAnswers {
  const hint = input.trim().replace(/^https?:\/\//, '').slice(0, 60);
  return {
    product: `Your product/service (from: ${hint})`,
    problem: 'The core pain your best customers hire you to solve.',
    best_customers: 'Mid-market B2B companies that get the most value from you.',
    industry: 'Software, Information Technology',
    company_size: '51–1000 employees',
    geography: 'North America, Europe',
    business_model: 'B2B',
    buyer_role: 'VP / Head of the relevant function',
    tools: 'HubSpot, Salesforce',
    triggers: 'New funding, leadership hire, or product launch',
    disqualifiers: 'Sub-10 employees, no website, or outside target industries',
    price_point: '$10k–$50k ACV',
  };
}

/** Infer the 12 wizard answers from a URL/description. Provider: Ollama (default) | Anthropic | mock. */
export async function analyzeBusinessToAnswers(input: string): Promise<WizardAnswers> {
  if (llmProvider() === 'mock') return mockAnswers(input);

  // If the input is a URL/domain, crawl the site and ground the draft in real
  // content instead of guessing from the name.
  let system = SYSTEM_INFER;
  let user = `Business: ${input}`;
  const url = urlFromInput(input);
  if (url) {
    const site = await scrapeWithTimeout(url);
    if (site && site.markdown.trim().length > 80) {
      system = SYSTEM_FROM_SITE;
      user = siteContext(site);
    }
  }

  const raw = await llmStructured({
    toolName: TOOL_NAME,
    schema: ANSWERS_SCHEMA,
    system,
    user,
    model: 'reasoning',
    maxTokens: 1500,
    temperature: 0.4,
    description: 'Return a concise DRAFT answer for each of the 12 ICP-wizard questions.',
  });

  // Coerce every question id to a non-null string; fall back to mock for any blanks.
  const fallback = mockAnswers(input);
  const answers: WizardAnswers = {};
  for (const q of WIZARD_QUESTIONS) {
    const v = raw[q.id];
    const s = typeof v === 'string' ? v.trim() : v == null ? '' : String(v);
    answers[q.id] = s || fallback[q.id];
  }
  return answers;
}
