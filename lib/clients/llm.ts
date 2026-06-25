/**
 * Shared LLM provider router — ONE place decides mock | ollama | anthropic so
 * every AI feature in the platform honours the same setting.
 *
 * This project runs a LOCAL LLM (Ollama) by default. Set `LLM_PROVIDER=ollama`
 * (or the legacy `ICP_LLM=ollama`, kept for back-compat). Any new AI use case
 * should call `llmStructured` rather than the Anthropic SDK directly, so it
 * automatically works under Ollama too.
 *
 * Providers:
 *   - ollama    → local Ollama, structured output via `format` = JSON schema
 *   - anthropic → Claude, forced tool call (structured JSON)
 *   - mock      → caller short-circuits with its own deterministic sample
 */

import type Anthropic from '@anthropic-ai/sdk';
import { anthropic, MODELS } from './anthropic';
import { getConfig } from '../config/app-config';

const OLLAMA_URL_KEY = 'ollama_url';
const OLLAMA_MODEL_KEY = 'ollama_model';
const OLLAMA_AUTH_KEY = 'ollama_auth'; // encrypted Authorization header value

export interface OllamaRuntimeConfig {
  url: string;
  model: string;
  authHeader: string | null;
  /** Where the URL came from — surfaced in Settings. */
  source: 'db' | 'env' | 'default';
}

/**
 * Resolve the live Ollama config: DB runtime config wins (editable in Settings,
 * no restart), then env, then the localhost default. Lets a rotating tunnel URL
 * be pasted in the app instead of redeployed.
 */
export async function resolveOllamaConfig(): Promise<OllamaRuntimeConfig> {
  const dbUrl = await getConfig(OLLAMA_URL_KEY);
  const url = dbUrl ?? process.env.OLLAMA_URL ?? 'http://localhost:11434';
  const model = (await getConfig(OLLAMA_MODEL_KEY)) ?? process.env.OLLAMA_MODEL ?? 'qwen2.5:1.5b';
  let authHeader: string | null = null;
  const encAuth = await getConfig(OLLAMA_AUTH_KEY);
  if (encAuth) {
    try {
      const { decryptToken } = await import('../engines/crm-sync-engine/crypto');
      authHeader = decryptToken(encAuth);
    } catch { authHeader = null; }
  }
  const source: OllamaRuntimeConfig['source'] = dbUrl ? 'db' : process.env.OLLAMA_URL ? 'env' : 'default';
  return { url: url.replace(/\/+$/, ''), model, authHeader, source };
}

export type LlmProvider = 'mock' | 'ollama' | 'anthropic';

/** Resolve the active provider. `LLM_PROVIDER` wins; `ICP_LLM` kept for back-compat. */
export function llmProvider(): LlmProvider {
  const v = (process.env.LLM_PROVIDER ?? process.env.ICP_LLM ?? '').toLowerCase();
  if (v === 'mock') return 'mock';
  if (v === 'ollama') return 'ollama';
  if (v === 'anthropic') return 'anthropic';
  // Unset: prefer a real Anthropic key if present, else mock (dev convenience).
  return process.env.ANTHROPIC_API_KEY ? 'anthropic' : 'mock';
}

export interface StructuredLlmOpts {
  /** Tool / output name (used as the Anthropic tool name). */
  toolName: string;
  /** JSON schema (must be an object schema) for the structured output. */
  schema: Record<string, unknown>;
  system: string;
  user: string;
  /** 'reasoning' (Sonnet) | 'batch' (Haiku) — Anthropic only; Ollama uses OLLAMA_MODEL. */
  model?: keyof typeof MODELS;
  maxTokens?: number;
  temperature?: number;
  description?: string;
}

/**
 * Return a structured JSON object from the active NON-mock provider. The caller
 * is responsible for (a) short-circuiting the `mock` case with its own sample,
 * and (b) validating the returned object's shape.
 */
export async function llmStructured(opts: StructuredLlmOpts): Promise<Record<string, unknown>> {
  const provider = llmProvider();
  if (provider === 'mock') {
    throw new Error('llmStructured called in mock mode — the caller must short-circuit mock first');
  }
  return provider === 'ollama' ? ollamaStructured(opts) : anthropicStructured(opts);
}

async function anthropicStructured(o: StructuredLlmOpts): Promise<Record<string, unknown>> {
  const tool = {
    name: o.toolName,
    description: o.description ?? `Emit ${o.toolName} as structured JSON.`,
    input_schema: o.schema,
  } as Anthropic.Tool;

  const resp = await anthropic().messages.create({
    model: MODELS[o.model ?? 'reasoning'],
    max_tokens: o.maxTokens ?? 1500,
    system: o.system,
    tools: [tool],
    tool_choice: { type: 'tool', name: o.toolName },
    messages: [{ role: 'user', content: o.user }],
  });
  const tu = resp.content.find((b) => b.type === 'tool_use');
  if (!tu || tu.type !== 'tool_use') {
    throw new Error(`${o.toolName}: model did not return a tool call`);
  }
  return tu.input as Record<string, unknown>;
}

async function ollamaStructured(o: StructuredLlmOpts): Promise<Record<string, unknown>> {
  const cfg = await resolveOllamaConfig();
  const res = await fetch(`${cfg.url}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(cfg.authHeader ? { Authorization: cfg.authHeader } : {}) },
    body: JSON.stringify({
      model: cfg.model,
      stream: false,
      format: o.schema, // constrained decoding → schema-shaped JSON
      options: { temperature: o.temperature ?? 0.4 },
      messages: [
        { role: 'system', content: `${o.system}\nReturn ONLY a JSON object matching the schema.` },
        { role: 'user', content: o.user },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Ollama error ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { message?: { content?: string } };
  return JSON.parse(data.message?.content ?? '{}') as Record<string, unknown>;
}

/** The label to record as `model_used` for the active provider. */
export function activeModelLabel(model: keyof typeof MODELS = 'reasoning'): string {
  const p = llmProvider();
  if (p === 'ollama') return process.env.OLLAMA_MODEL ?? 'ollama';
  if (p === 'anthropic') return MODELS[model];
  return 'mock';
}
