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

  // HubSpot — Phase 1 dev shortcut per ADR-017. A Service Key from the test
  // portal. Optional at the framework level so the API still boots without
  // HubSpot configured; HubspotAdapter throws a clear error if invoked
  // without a credential.
  HUBSPOT_SERVICE_KEY: z.string().optional(),
});

export type AppConfig = z.infer<typeof configSchema>;
