import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

export type DbConfig = {
  url: string;
  max?: number;
};

export function createDb(config: DbConfig) {
  const client = postgres(config.url, {
    max: config.max ?? 10,
    prepare: false,
  });
  const db = drizzle(client, { schema });
  return { db, client };
}

export type Database = ReturnType<typeof createDb>['db'];
