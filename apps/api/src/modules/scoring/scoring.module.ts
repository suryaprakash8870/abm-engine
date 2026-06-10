import { Module } from '@nestjs/common';
import { ScoringService } from './scoring.service';

/**
 * Scoring (component 2/5).
 *
 * Applies the ICP rubric (stored per-org in `icp_rubrics`) to an enriched
 * account → fit score + tier (1/2/3). Pure functions of (rubric, account).
 *
 * Phase 0: empty stub. ICP rubric DSL + tier thresholds land in Phase 1.
 * Per ADR-013: rules-based for now; ML deferred until rules are proven
 * insufficient at the Phase 2 validation gate.
 */
@Module({
  providers: [ScoringService],
  exports: [ScoringService],
})
export class ScoringModule {}
