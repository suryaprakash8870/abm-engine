import type { Config } from 'drizzle-kit';

export default {
  schema: './src/schema/index.ts',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://abm:abm@localhost:5432/abm',
  },
  strict: true,
  verbose: true,
} satisfies Config;
