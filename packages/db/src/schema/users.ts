import { pgTable, uuid, text, timestamp, index } from 'drizzle-orm/pg-core';
import { organizations } from './organizations';

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    supabaseUserId: uuid('supabase_user_id').notNull().unique(),
    email: text('email').notNull(),
    role: text('role', { enum: ['owner', 'admin', 'member'] }).notNull().default('member'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('users_org_id_idx').on(t.orgId)],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
