import { Module } from '@nestjs/common';
import { RedisModule } from '../../common/redis/redis.module';
import { ScoringModule } from '../scoring/scoring.module';
import { EnrichmentService } from './enrichment.service';
import { EnrichmentProcessor } from './enrichment.processor';
import { ApolloEnrichmentProvider, MockEnrichmentProvider } from './enrichment.providers';

/**
 * Enrichment (component 1/5).
 *
 * Given a domain → firmographics + technographics. Always a BullMQ job —
 * never inside a request (hard rule #2, ADR-007).
 *
 * Provider: Apollo when APOLLO_API_KEY is set; deterministic mock otherwise
 * (ADR-014 — live enrichment is the first paid line item).
 */
@Module({
  imports: [RedisModule, ScoringModule],
  providers: [
    EnrichmentService,
    EnrichmentProcessor,
    ApolloEnrichmentProvider,
    MockEnrichmentProvider,
  ],
  exports: [EnrichmentService],
})
export class EnrichmentModule {}
