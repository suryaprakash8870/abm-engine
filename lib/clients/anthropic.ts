/**
 * Shared Anthropic Claude client.
 *
 * Model policy (ADR-009): Haiku for high-volume batch classification, Sonnet for
 * low-volume reasoning. Don't hardcode model ids in engines — use MODELS.
 * Prompts are versioned in the DB (`prompt_versions`), not hardcoded (conventions.md).
 */

import Anthropic from '@anthropic-ai/sdk';

export const MODELS = {
  /** Reasoning: ICP synthesis, scoring-formula generation, email drafts, flywheel analysis. */
  reasoning: 'claude-sonnet-4-6',
  /** Batch: account qualification, role assignment, signal classification (~18x cheaper). */
  batch: 'claude-haiku-4-5',
} as const;

let client: Anthropic | null = null;

export function anthropic(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set.');
    client = new Anthropic({ apiKey });
  }
  return client;
}
