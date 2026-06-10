import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { REDIS_CLIENT, RedisService, createRedisClient } from './redis.service';

/**
 * Global Redis access — separate from BullMQ's internal connection so the
 * cache layer can be tuned/scaled independently. lazyConnect:true so the
 * API still boots if Redis isn't up yet.
 */
@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: createRedisClient,
      inject: [ConfigService],
    },
    RedisService,
  ],
  exports: [RedisService, REDIS_CLIENT],
})
export class RedisModule {}
