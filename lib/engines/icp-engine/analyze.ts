/**
 * Business → draft wizard answers.
 *
 * Turns a website URL or a freeform business description into a DRAFT set of the
 * 12 ICP-wizard answers, so the wizard can pre-fill instead of cold-asking. The
 * user reviews + edits the drafts before synthesis. This is the "paste your site,
 * AI fills it in" intake step (oppora-style onboarding).
 *
 * FREE TESTING: with no ANTHROPIC_API_KEY (or ICP_LLM=mock) it returns a
 * deterministic draft so the flow works offline.
 */

import { llmProvider, llmStructured } from '../../clients/llm';
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

const SYSTEM =
  'You are a B2B go-to-market strategist. Given a company website URL or a ' +
  'freeform description of a business, infer concise, realistic DRAFT answers to ' +
  '12 questions used to build an Ideal Customer Profile. Keep each answer to one ' +
  'short phrase or sentence. If the input is only a URL, infer from the likely ' +
  'company. These are drafts the user will review and edit — be specific and ' +
  'plausible, do not over-claim, and never leave an answer blank.';

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

  const raw = await llmStructured({
    toolName: TOOL_NAME,
    schema: ANSWERS_SCHEMA,
    system: SYSTEM,
    user: `Business: ${input}`,
    model: 'reasoning',
    maxTokens: 1500,
    temperature: 0.5,
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
