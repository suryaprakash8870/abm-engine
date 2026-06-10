import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { configSchema } from './config/config.schema';
import { DbModule } from './common/db/db.module';
import { CryptoModule } from './common/crypto/crypto.module';
import { TenantModule } from './common/tenant/tenant.module';
import { QueueModule } from './common/queue/queue.module';
import { RedisModule } from './common/redis/redis.module';
import { HealthModule } from './common/health/health.module';
import { EnrichmentModule } from './modules/enrichment/enrichment.module';
import { ScoringModule } from './modules/scoring/scoring.module';
import { SignalScorerModule } from './modules/signal-scorer/signal-scorer.module';
import { OrchestratorModule } from './modules/orchestrator/orchestrator.module';
import { CrmAdapterModule } from './modules/crm-adapter/crm-adapter.module';
import { DevModule } from './modules/dev/dev.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Read apps/api/.env first, fall back to the repo-root .env. This lets the
      // developer keep a single .env at the repo root without copying secrets
      // into every workspace. First file found wins per key.
      envFilePath: ['.env', '../../.env'],
      validate: (env) => configSchema.parse(env),
    }),
    DbModule,
    CryptoModule,
    TenantModule,
    QueueModule,
    RedisModule,
    HealthModule,
    EnrichmentModule,
    ScoringModule,
    SignalScorerModule,
    OrchestratorModule,
    CrmAdapterModule,
    DevModule,
  ],
})
export class AppModule {}
