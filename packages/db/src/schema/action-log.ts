import { pgTable, uuid, text, jsonb, timestamp, index } from 'drizzle-orm/pg-core';
import { organizations } from './organizations';
import { accounts } from './accounts';
import { orchestratorRules } from './orchestrator-rules';

/**
 * Audit trail — every action the orchestrator fires (or fails to fire) is
 * recorded here (TODO Phase 3: "Log every triggered action"). Also serves as
 * the cooldown/anti-double-enrollment check: a rule won't refire for the same
 * account within its cooldown window.
 */
export const actionLog = pgTable(
  'action_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    ruleId: uuid('rule_id').references(() => orchestratorRules.id, { onDelete: 'set null' }),
    accountId: uuid('account_id').references(() => accounts.id, { onDelete: 'cascade' }),
    action: text('action').notNull(), // 'slack' | 'crm-task' | 'email-sequence'
    status: text('status', { enum: ['sent', 'failed'] }).notNull(),
    detail: jsonb('detail').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('action_log_org_idx').on(t.orgId),
    index('action_log_rule_account_idx').on(t.orgId, t.ruleId, t.accountId, t.createdAt),
  ],
);

export type ActionLogEntry = typeof actionLog.$inferSelect;
export type NewActionLogEntry = typeof actionLog.$inferInsert;
