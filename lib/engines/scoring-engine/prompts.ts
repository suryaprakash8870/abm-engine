/**
 * Prompts + tool schema for scoring formula generation (Engine 04).
 *
 * Claude Sonnet 4.6 generates a weighted, transparent scoring formula from the
 * ICP. One tool call forces structured JSON output.
 */

import type Anthropic from '@anthropic-ai/sdk';

export const FORMULA_TOOL_NAME = 'emit_scoring_formula';

export const FORMULA_TOOL: Anthropic.Tool = {
  name: FORMULA_TOOL_NAME,
  description: 'Emit a weighted scoring formula derived from the ICP.',
  input_schema: {
    type: 'object' as const,
    required: ['criteria'],
    properties: {
      criteria: {
        type: 'array',
        minItems: 4,
        maxItems: 8,
        items: {
          type: 'object',
          required: ['key', 'label', 'weight', 'rationale'],
          properties: {
            key: { type: 'string' },
            label: { type: 'string' },
            weight: { type: 'number', minimum: 0.05, maximum: 0.5 },
            rationale: { type: 'string' },
          },
        },
      },
    },
  },
};

export const FORMULA_SYSTEM_PROMPT = `You are a B2B go-to-market expert building an account scoring formula.
Given a structured Ideal Customer Profile (ICP), generate a weighted scoring formula with 4-8 criteria.
Rules:
- All weights must sum to exactly 1.0
- Each criterion must have a clear, measurable definition
- Rationale must explain WHY this criterion matters for fit
- Prioritise criteria with strong ICP signals over weak ones
- Return ONLY the tool call, no prose`;

export function buildFormulaPrompt(icp: {
  firmographics: Record<string, unknown>;
  technographics: Record<string, unknown>;
  signals: Record<string, unknown>;
  exclusions: Record<string, unknown>;
}): string {
  return `Generate a scoring formula for this ICP:

FIRMOGRAPHICS:
${JSON.stringify(icp.firmographics, null, 2)}

TECHNOGRAPHICS:
${JSON.stringify(icp.technographics, null, 2)}

BUYING SIGNALS:
${JSON.stringify(icp.signals, null, 2)}

EXCLUSIONS:
${JSON.stringify(icp.exclusions, null, 2)}

Create a 4-8 criterion weighted formula. Weights must sum to 1.0. Each criterion should be independently scorable (1.0 perfect / 0.5 partial / 0.0 no match).`;
}
