/**
 * Shared Claude → structured-ICP helper, used by all three modes.
 *
 * Forces the `emit_icp` tool call (prompts.ts) so the model returns the ICP as
 * structured JSON, validates it against `icpContentSchema`, and retries once on a
 * schema miss before failing (conventions.md).
 */

import type Anthropic from '@anthropic-ai/sdk';
import { anthropic, MODELS } from '../../clients/anthropic';
import { ICP_TOOL, ICP_TOOL_NAME } from './prompts';
import { icpContentSchema, type IcpContent } from './types';

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
  const first = icpContentSchema.safeParse(await callEmitIcp(system, user));
  if (first.success) return first.data;
  const second = icpContentSchema.safeParse(await callEmitIcp(system, user));
  if (second.success) return second.data;
  throw new Error(`ICP synthesis failed schema validation: ${second.error.message}`);
}
