import { Global, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { QUEUES } from './queue.constants';

/**
 * Global BullMQ setup. All workers and producers wire through here.
 * `removeOnComplete` / `removeOnFail` keep Redis from growing without bound;
 * we lift these into per-queue tuning when traffic justifies it.
 */
@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => {
        const url = config.getOrThrow<string>('REDIS_URL');
        return {
          // lazyConnect so a missing Redis at boot doesn't crash the API.
          // First produce/consume will surface the connection error instead.
          connection: { url, lazyConnect: true, maxRetriesPerRequest: null } as unknown as Record<string, unknown>,
          defaultJobOptions: {
            attempts: 5,
            backoff: { type: 'exponential', delay: 2_000 },
            removeOnComplete: { count: 1_000, age: 24 * 3600 },
            removeOnFail: { count: 5_000 },
          },
        };
      },
      inject: [ConfigService],
    }),
    BullModule.registerQueue(
      ...Object.values(QUEUES).map((name) => ({ name })),
    ),
  ],
  exports: [BullModule],
})
export class QueueModule {}
