import { pgTable, uuid, text, real, integer, jsonb, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { organizations } from './organizations';
import { accounts } from './accounts';

/**
 * One row per account = the current rolling score snapshot.
 * Historical snapshots can be added later as an append-only table if needed
 * for the Phase 2 validation gate (awareness vs closed-won correlation).
 */
export const scores = pgTable(
  'scores',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    fitScore: real('fit_score').notNull().default(0),
    tier: integer('tier'),
    signalScore: real('signal_score').notNull().default(0),
    // Awareness stage — Phase 2 funnel (Identified → Aware → Engaged → Considering → Selecting).
    awarenessStage: text('awareness_stage', {
      enum: ['identified', 'aware', 'engaged', 'considering', 'selecting'],
    }),
    // Append-only stage transitions [{stage, at}] — feeds the Phase 2
    // validation gate (what stage was the account in before it closed?).
    stageHistory: jsonb('stage_history').$type<Array<{ stage: string; at: string }>>(),
    computedAt: timestamp('computed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('scores_org_id_idx').on(t.orgId),
    uniqueIndex('scores_org_account_uq').on(t.orgId, t.accountId),
    index('scores_tier_idx').on(t.orgId, t.tier),
  ],
);

export type Score = typeof scores.$inferSelect;
export type NewScore = typeof scores.$inferInsert;
