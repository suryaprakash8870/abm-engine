/**
 * ICP domain types + validation schemas (Mode A: Hypothesis wizard).
 *
 * The structured ICP content (`IcpContent`) is produced identically by all three
 * modes (doc step 5). Claude must emit exactly this shape; we validate it with Zod
 * before persisting, which is the "schema validation" half of the task-completion
 * check (ADR-003).
 */

import { z } from 'zod';
import type { IcpMode } from '../../events';

// ── Structured ICP content ───────────────────────────────────────────────────

export const firmographicsSchema = z.object({
  industries: z.array(z.string()).min(1),
  employee_min: z.number().int().nonnegative(),
  employee_max: z.number().int().nonnegative(),
  geographies: z.array(z.string()),
  business_model: z.string(),
});

export const technographicsSchema = z.object({
  required: z.array(z.string()),
  preferred: z.array(z.string()),
  excluded: z.array(z.string()),
});

export const signalsSchema = z.object({
  high_intent: z.array(z.string()),
  medium_intent: z.array(z.string()),
});

export const exclusionsSchema = z.object({
  industries: z.array(z.string()),
  disqualifiers: z.array(z.string()),
});

export const CRITERIA = ['firmographics', 'technographics', 'signals', 'exclusions'] as const;
export type Criterion = (typeof CRITERIA)[number];

/** Per-criterion confidence (0..1) — required, populated for EVERY criterion. */
export const criteriaConfidenceSchema = z.object({
  firmographics: z.number().min(0).max(1),
  technographics: z.number().min(0).max(1),
  signals: z.number().min(0).max(1),
  exclusions: z.number().min(0).max(1),
});

export const icpContentSchema = z.object({
  firmographics: firmographicsSchema,
  technographics: technographicsSchema,
  signals: signalsSchema,
  exclusions: exclusionsSchema,
  criteria_confidence: criteriaConfidenceSchema,
  rationale: z.string(),
});

export type IcpContent = z.infer<typeof icpContentSchema>;

/** A persisted ICP definition: identity + version + the structured content. */
export interface IcpDefinition {
  icp_id: string;
  version: number;
  mode: IcpMode;
  firmographics: IcpContent['firmographics'];
  technographics: IcpContent['technographics'];
  signals: IcpContent['signals'];
  exclusions: IcpContent['exclusions'];
  confidence_score: number;
  criteria_confidence: IcpContent['criteria_confidence'];
}

/** Overall ICP confidence = mean of the per-criterion confidences. */
export function overallConfidence(c: IcpContent['criteria_confidence']): number {
  const vals = Object.values(c);
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  return Math.round(mean * 100) / 100;
}

// ── The 12-question Hypothesis wizard (Mode A) ───────────────────────────────

export interface WizardQuestion {
  id: string;
  prompt: string;
  helper: string;
}

export const WIZARD_QUESTIONS: WizardQuestion[] = [
  { id: 'product', prompt: 'What do you sell?', helper: 'One sentence on your product or service.' },
  { id: 'problem', prompt: 'What core problem does it solve?', helper: 'The pain your best customers hire you for.' },
  { id: 'best_customers', prompt: 'Describe your 2–3 best customers.', helper: 'Names or types — who gets the most value.' },
  { id: 'industry', prompt: 'Which industries fit best?', helper: 'Comma-separated, most important first.' },
  { id: 'company_size', prompt: 'Target company size?', helper: 'e.g. 51–200 employees, or a range.' },
  { id: 'geography', prompt: 'Which regions or countries?', helper: 'Where your ideal customers operate.' },
  { id: 'business_model', prompt: 'B2B, B2C, or B2B2C?', helper: 'Primary go-to-market model.' },
  { id: 'buyer_role', prompt: 'Who is the primary buyer / decision-maker?', helper: 'Title or function that signs off.' },
  { id: 'tools', prompt: 'What tools do good-fit accounts already use?', helper: 'Technographic signals of fit.' },
  { id: 'triggers', prompt: 'What events signal they’re ready to buy?', helper: 'Funding, hiring, launches, etc.' },
  { id: 'disqualifiers', prompt: 'Who is NOT a fit? Any red flags?', helper: 'Used to build exclusions.' },
  { id: 'price_point', prompt: 'Typical deal size / ACV?', helper: 'Rough average contract value.' },
];

export const WIZARD_QUESTION_IDS = WIZARD_QUESTIONS.map((q) => q.id);

/** Validates that all 12 wizard answers are present and non-empty. */
export const wizardAnswersSchema = z
  .record(z.string(), z.string())
  .superRefine((ans, ctx) => {
    for (const id of WIZARD_QUESTION_IDS) {
      if (!ans[id] || ans[id].trim() === '') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Missing answer for "${id}"`,
          path: [id],
        });
      }
    }
  });

export type WizardAnswers = Record<string, string>;

/**
 * Mode C request body. The CSV is parsed in the browser (Papa Parse) and sent as
 * rows + a mapping from Deal fields → CSV column names. Recognised mapping keys:
 * outcome, domain, industry, employees, revenue, geography, amount, tech.
 */
export const csvImportSchema = z.object({
  rows: z.array(z.record(z.string(), z.string())).min(1),
  field_mapping: z.record(z.string(), z.string()),
});

export type CsvImportBody = z.infer<typeof csvImportSchema>;
