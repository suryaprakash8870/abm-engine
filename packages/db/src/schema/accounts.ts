import { pgTable, uuid, text, jsonb, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { organizations } from './organizations';

/**
 * Accounts = target companies in this org's ABM list.
 * Sourced from the connected CRM; enriched async via BullMQ (see ADR-007).
 */
export const accounts = pgTable(
  'accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    domain: text('domain').notNull(),
    name: text('name'),
    // CRM external id — opaque, depends on provider. Indexed for write-back upsert.
    externalCrmId: text('external_crm_id'),
    externalCrmProvider: text('external_crm_provider', {
      enum: ['hubspot', 'salesforce'],
    }),
    // Enrichment payload (firmographics + technographics). Free-form by design;
    // shape evolves as providers/Phase 1 lands. See ADR-014.
    enrichment: jsonb('enrichment').$type<Record<string, unknown>>(),
    enrichedAt: timestamp('enriched_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('accounts_org_id_idx').on(t.orgId),
    uniqueIndex('accounts_org_domain_uq').on(t.orgId, t.domain),
    index('accounts_external_crm_idx').on(t.orgId, t.externalCrmProvider, t.externalCrmId),
  ],
);

export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;
