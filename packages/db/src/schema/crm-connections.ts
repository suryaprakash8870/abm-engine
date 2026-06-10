import { pgTable, uuid, text, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { organizations } from './organizations';

export const crmConnections = pgTable(
  'crm_connections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    provider: text('provider', { enum: ['hubspot', 'salesforce'] }).notNull(),
    // Encrypted via the API's CryptoService (AES-256-GCM). NEVER store plaintext.
    accessTokenEncrypted: text('access_token_encrypted').notNull(),
    refreshTokenEncrypted: text('refresh_token_encrypted'),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    externalAccountId: text('external_account_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('crm_connections_org_id_idx').on(t.orgId),
    uniqueIndex('crm_connections_org_provider_uq').on(t.orgId, t.provider),
  ],
);

export type CrmConnection = typeof crmConnections.$inferSelect;
export type NewCrmConnection = typeof crmConnections.$inferInsert;
