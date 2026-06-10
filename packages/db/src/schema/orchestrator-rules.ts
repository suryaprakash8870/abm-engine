import { pgTable, uuid, text, jsonb, boolean, timestamp, index } from 'drizzle-orm/pg-core';
import { organizations } from './organizations';

/**
 * Orchestrator rules — "if score > X AND signal = Y → action Z" as config,
 * never code (ADR-003 / TODO Phase 3). One row per rule, org-scoped.
 *
 * Gate-respecting default: no rules are seeded. The orchestrator does nothing
 * until a human creates AND enables a rule — which should only happen after
 * the Phase 2 awareness-validation gate passes.
 */
export const orchestratorRules = pgTable(
  'orchestrator_rules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    enabled: boolean('enabled').notNull().default(false),
    /**
     * Condition — ALL present fields must match (AND semantics):
     * { minFitScore?, minSignalScore?, tierIn?: number[],
     *   awarenessStageIn?: string[], signalTypeIs?: string }
     */
    condition: jsonb('condition').notNull().$type<Record<string, unknown>>(),
    /**
     * Actions — executed in order:
     * [{ type: 'slack' } | { type: 'crm-task', subjectTemplate? }
     *  | { type: 'email-sequence', sequenceId? }]
     */
    actions: jsonb('actions').notNull().$type<Array<Record<string, unknown>>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('orchestrator_rules_org_idx').on(t.orgId)],
);

export type OrchestratorRule = typeof orchestratorRules.$inferSelect;
export type NewOrchestratorRule = typeof orchestratorRules.$inferInsert;
