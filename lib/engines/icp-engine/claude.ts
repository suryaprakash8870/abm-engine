/**
 * Shared Claude → structured-ICP helper, used by all three modes.
 *
 * Forces the `emit_icp` tool call (prompts.ts) so the model returns the ICP as
 * structured JSON, validates it against `icpContentSchema`, and retries once on a
 * schema miss before failing (conventions.md).
 *
 * FREE TESTING: set `ICP_LLM=mock` (or just run `next dev` with no ANTHROPIC_API_KEY)
 * and synthesis returns a deterministic sample ICP instead of calling Claude — no
 * key, no cost. Use a real ANTHROPIC_API_KEY for genuine AI output.
 */

import type Anthropic from '@anthropic-ai/sdk';
import { anthropic, MODELS } from '../../clients/anthropic';
import { ICP_TOOL, ICP_TOOL_NAME } from './prompts';
import { icpContentSchema, type IcpContent } from './types';

/** True when synthesis should be mocked (no LLM call). */
function shouldMockLlm(): boolean {
  if (process.env.ICP_LLM === 'mock') return true;
  // Convenience for local UI testing: auto-mock in `next dev` when no key is set.
  if (process.env.NODE_ENV === 'development' && !process.env.ANTHROPIC_API_KEY) {
    console.warn(
      JSON.stringify({
        level: 'warn',
        component: 'icp-engine',
        msg: 'No ANTHROPIC_API_KEY — using MOCK ICP synthesis. Add a key for real output, or set ICP_LLM=mock to silence this.',
      }),
    );
    return true;
  }
  return false;
}

/** A valid, deterministic sample ICP for free/offline testing. */
function mockIcpContent(): IcpContent {
  return {
    firmographics: {
      industries: ['Software', 'Information Technology'],
      employee_min: 51,
      employee_max: 1000,
      geographies: ['North America', 'Europe'],
      business_model: 'B2B SaaS',
    },
    technographics: { required: ['HubSpot'], preferred: ['Segment', 'Snowflake'], excluded: [] },
    signals: {
      high_intent: ['Pricing page visit', 'Demo request'],
      medium_intent: ['Blog subscription', 'Webinar attendance'],
    },
    exclusions: { industries: ['Government', 'Education'], disqualifiers: ['Fewer than 10 employees', 'No website'] },
    criteria_confidence: { firmographics: 0.6, technographics: 0.5, signals: 0.55, exclusions: 0.5 },
    rationale: 'MOCK ICP generated without an LLM (ICP_LLM=mock). Set ANTHROPIC_API_KEY for real Claude synthesis.',
  };
}

async function callEmitIcp(system: string, user: string): Promise<unknown> {
  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: user }];
  const resp = await anthropic().messages.create({
    model: MODELS.reasoning,
    max_tokens: 2000,
    system,
    tools: [ICP_TOOL],
    tool_choice: { type: 'tool', name: ICP_TOOL_NAME },
    messages,
  });
  const toolUse = resp.content.find((b) => b.type === 'tool_use');
  if (!toolUse || toolUse.type !== 'tool_use') {
    throw new Error('Claude did not return an emit_icp tool call');
  }
  return toolUse.input;
}

/** Synthesise a validated IcpContent from a system + user prompt (one corrective retry). */
export async function synthesiseContent(system: string, user: string): Promise<IcpContent> {
  if (shouldMockLlm()) return mockIcpContent();

  const first = icpContentSchema.safeParse(await callEmitIcp(system, user));
  if (first.success) return first.data;
  const second = icpContentSchema.safeParse(await callEmitIcp(system, user));
  if (second.success) return second.data;
  throw new Error(`ICP synthesis failed schema validation: ${second.error.message}`);
}
