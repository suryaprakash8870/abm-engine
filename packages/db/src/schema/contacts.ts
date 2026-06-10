import { pgTable, uuid, text, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { organizations } from './organizations';
import { accounts } from './accounts';

export const contacts = pgTable(
  'contacts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    accountId: uuid('account_id').references(() => accounts.id, { onDelete: 'set null' }),
    email: text('email'),
    phone: text('phone'),
    firstName: text('first_name'),
    lastName: text('last_name'),
    title: text('title'),
    // Buying role — written back to CRM in Phase 3 (see TODO.md).
    role: text('role', {
      enum: ['influencer', 'decision_maker', 'champion', 'unknown'],
    }).default('unknown'),
    externalCrmId: text('external_crm_id'),
    externalCrmProvider: text('external_crm_provider', {
      enum: ['hubspot', 'salesforce'],
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('contacts_org_id_idx').on(t.orgId),
    index('contacts_account_idx').on(t.orgId, t.accountId),
    uniqueIndex('contacts_org_email_uq').on(t.orgId, t.email),
  ],
);

export type Contact = typeof contacts.$inferSelect;
export type NewContact = typeof contacts.$inferInsert;
