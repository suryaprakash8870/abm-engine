import { Module } from '@nestjs/common';
import { SignalScorerService } from './signal-scorer.service';

/**
 * Signal Scorer (component 3/5).
 *
 * Ingests 1st / 2nd / 3rd-party signals → weighted, time-decayed score per account.
 * Per ADR-009 / hard rule #4: 1st-party ≫ 3rd-party, NEVER equal weighting.
 *
 * Phase 0: empty stub. Weighting + decay land in Phase 2.
 */
@Module({
  providers: [SignalScorerService],
  exports: [SignalScorerService],
})
export class SignalScorerModule {}
