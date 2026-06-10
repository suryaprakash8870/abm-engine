import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createDb } from '@abm/db';

export const DB_TOKEN = Symbol('ABM_DB');
export const DB_CLIENT_TOKEN = Symbol('ABM_DB_CLIENT');

/**
 * Global DB module. Drizzle instance + raw `postgres` client.
 * The raw client is exposed so request-scoped tenant code can call
 * `SET LOCAL app.current_org_id` inside a transaction.
 */
@Global()
@Module({
  providers: [
    {
      provide: DB_TOKEN,
      useFactory: (config: ConfigService) => {
        const url = config.getOrThrow<string>('DATABASE_URL');
        return createDb({ url });
      },
      inject: [ConfigService],
    },
    {
      provide: DB_CLIENT_TOKEN,
      useFactory: (handle: ReturnType<typeof createDb>) => handle.client,
      inject: [DB_TOKEN],
    },
  ],
  exports: [DB_TOKEN, DB_CLIENT_TOKEN],
})
export class DbModule {}
