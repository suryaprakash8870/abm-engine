import { Module } from '@nestjs/common';
import { EnrichmentService } from './enrichment.service';

/**
 * Enrichment (component 1/5).
 *
 * Given a domain → fetch firmographics + technographics via Apollo/Clearbit.
 * Always runs as a BullMQ job — never inside a request (hard rule #2, ADR-007).
 *
 * Phase 0 ships an empty module + service stub. Provider integration lands in Phase 1.
 */
@Module({
  providers: [EnrichmentService],
  exports: [EnrichmentService],
})
export class EnrichmentModule {}
