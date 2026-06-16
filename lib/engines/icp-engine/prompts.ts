/**
 * Claude synthesis prompt + structured-output tool for Mode A.
 *
 * We force a single tool call (`emit_icp`) so Claude returns the ICP as structured
 * JSON we can validate against `icpContentSchema` — never free text (conventions.md:
 * "force structured JSON output and validate").
 */

import type Anthropic from '@anthropic-ai/sdk';
import { WIZARD_QUESTIONS, type WizardAnswers } from './types';

export const ICP_TOOL_NAME = 'emit_icp';

export const ICP_TOOL: Anthropic.Tool = {
  name: ICP_TOOL_NAME,
  description:
    'Emit the structured Ideal Customer Profile (firmographics, technographics, ' +
    'buying signals, exclusions) derived from the founder’s answers, with a ' +
    'confidence score (0–1) for each of the four criteria.',
  input_schema: {
    type: 'object',
    required: ['firmographics', 'technographics', 'signals', 'exclusions', 'criteria_confidence', 'rationale'],
    properties: {
      firmographics: {
        type: 'object',
        required: ['industries', 'employee_min', 'employee_max', 'geographies', 'business_model'],
        properties: {
          industries: { type: 'array', items: { type: 'string' } },
          employee_min: { type: 'integer' },
          employee_max: { type: 'integer' },
          geographies: { type: 'array', items: { type: 'string' } },
          business_model: { type: 'string' },
        },
      },
      technographics: {
        type: 'object',
        required: ['required', 'preferred', 'excluded'],
        properties: {
          required: { type: 'array', items: { type: 'string' } },
          preferred: { type: 'array', items: { type: 'string' } },
          excluded: { type: 'array', items: { type: 'string' } },
        },
      },
      signals: {
        type: 'object',
        required: ['high_intent', 'medium_intent'],
        properties: {
          high_intent: { type: 'array', items: { type: 'string' } },
          medium_intent: { type: 'array', items: { type: 'string' } },
        },
      },
      exclusions: {
        type: 'object',
        required: ['industries', 'disqualifiers'],
        properties: {
          industries: { type: 'array', items: { type: 'string' } },
          disqualifiers: { type: 'array', items: { type: 'string' } },
        },
      },
      criteria_confidence: {
        type: 'object',
        required: ['firmographics', 'technographics', 'signals', 'exclusions'],
        properties: {
          firmographics: { type: 'number' },
          technographics: { type: 'number' },
          signals: { type: 'number' },
          exclusions: { type: 'number' },
        },
      },
      rationale: { type: 'string' },
    },
  },
};

export const SYSTEM_PROMPT =
  'You are an expert B2B go-to-market strategist. From a founder’s answers to a ' +
  'short questionnaire, synthesise a precise, actionable Ideal Customer Profile. ' +
  'Be specific and opinionated: infer reasonable values where answers are thin, ' +
  'but lower the confidence for any criterion you had to infer. Confidence is 0–1 ' +
  '(1 = stated explicitly and unambiguous; 0.3 = mostly your inference). Always ' +
  'call the emit_icp tool with the structured profile.';

/** Render the 12 answers into the user turn. */
export function buildUserPrompt(answers: WizardAnswers): string {
  const body = WIZARD_QUESTIONS.map(
    (q) => `Q: ${q.prompt}\nA: ${answers[q.id] ?? '(no answer)'}`,
  ).join('\n\n');
  return `Here are the founder’s answers:\n\n${body}\n\nCall emit_icp with the synthesised ICP.`;
}
