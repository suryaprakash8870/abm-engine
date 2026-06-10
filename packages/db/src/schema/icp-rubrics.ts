import { pgTable, uuid, text, jsonb, timestamp, integer, index } from 'drizzle-orm/pg-core';
import { organizations } from './organizations';

/**
 * ICP rubric = the scoring config. Editable per-org.
 * `weights` is a JSON shape like:
 *   { industry: { saas: 25, fintech: 10 }, employees: { "50-200": 30 }, ... }
 * Versioned: the engine always reads the active version (the highest by version).
 */
export const icpRubrics = pgTable(
  'icp_rubrics',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    version: integer('version').notNull().default(1),
    name: text('name').notNull(),
    weights: jsonb('weights').notNull().$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('icp_rubrics_org_id_idx').on(t.orgId)],
);

export type IcpRubric = typeof icpRubrics.$inferSelect;
export type NewIcpRubric = typeof icpRubrics.$inferInsert;
