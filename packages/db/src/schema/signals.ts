import { pgTable, uuid, text, jsonb, timestamp, real, index } from 'drizzle-orm/pg-core';
import { organizations } from './organizations';
import { accounts } from './accounts';
import { contacts } from './contacts';

/**
 * Normalized signal-event table — feeds the Signal Scorer.
 * Per ADR-009: 1st-party heavily outweighs 3rd-party; old signals decay.
 * `party` distinguishes source for weighting; `weight` is the static base
 * weight assigned at ingestion (decay is applied at score-compute time).
 */
export const signals = pgTable(
  'signals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    accountId: uuid('account_id').references(() => accounts.id, { onDelete: 'cascade' }),
    contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'set null' }),
    // e.g. 'pricing_page_visit', 'email_open', 'demo_request', 'g2_intent', 'job_change'
    type: text('type').notNull(),
    party: text('party', { enum: ['first', 'second', 'third'] }).notNull(),
    source: text('source'),
    weight: real('weight').notNull().default(1),
    payload: jsonb('payload').$type<Record<string, unknown>>(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    ingestedAt: timestamp('ingested_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('signals_org_id_idx').on(t.orgId),
    index('signals_account_occurred_idx').on(t.orgId, t.accountId, t.occurredAt),
    index('signals_type_idx').on(t.orgId, t.type),
  ],
);

export type Signal = typeof signals.$inferSelect;
export type NewSignal = typeof signals.$inferInsert;
