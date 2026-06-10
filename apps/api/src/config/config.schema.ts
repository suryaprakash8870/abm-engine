import { z } from 'zod';

/**
 * Fail-fast env validation. Required vars throw at boot — better than
 * a silent misconfig that surfaces hours later under load.
 */
export const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().default(4000),

  DATABASE_URL: z.string().url().or(z.string().startsWith('postgres://')),
  REDIS_URL: z.string().url().or(z.string().startsWith('redis://')),

  // 32-byte base64 key for AES-256-GCM (see CryptoService).
  SECRETS_ENCRYPTION_KEY: z.string().min(1),

  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),

  // HS256 secret for verifying Supabase-issued JWTs locally (ADR-018).
  // Dashboard → Settings → API → JWT Secret. Optional so the API boots
  // without auth configured; the dev x-org-id fallback covers local work.
  SUPABASE_JWT_SECRET: z.string().optional(),

  // HubSpot — Phase 1 dev shortcut per ADR-017. A Service Key from the test
  // portal. Optional at the framework level so the API still boots without
  // HubSpot configured; HubspotAdapter throws a clear error if invoked
  // without a credential.
  HUBSPOT_SERVICE_KEY: z.string().optional(),

  // Salesforce — Phase 4 dev credentials (Developer Edition org, same
  // env-key pattern as ADR-017). Adapter throws a clear error if unset.
  SALESFORCE_INSTANCE_URL: z.string().url().optional(),
  SALESFORCE_ACCESS_TOKEN: z.string().optional(),

  // Apollo — first paid line item (ADR-014). Unset → mock enrichment +
  // TAM search returns 503 with activation instructions.
  APOLLO_API_KEY: z.string().optional(),

  // Base URL of the dashboard — used in Slack alert links.
  WEB_BASE_URL: z.string().url().optional(),
});

export type AppConfig = z.infer<typeof configSchema>;
