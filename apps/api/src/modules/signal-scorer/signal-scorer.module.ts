import { Module } from '@nestjs/common';
import { OrchestratorModule } from '../orchestrator/orchestrator.module';
import { SignalScorerService } from './signal-scorer.service';
import { SignalScorerProcessor } from './signal-scorer.processor';
import { SignalsController } from './signals.controller';

/**
 * Signal Scorer (component 3/5).
 *
 * Ingests 1st / 2nd / 3rd-party signals → weighted, time-decayed score per
 * account + awareness stage (ADR-009 / hard rule #4: 1st ≫ 3rd, NEVER equal).
 *
 * Ingestion = fast insert via POST /api/signals; recompute + orchestrator
 * evaluation run on the SIGNAL_INGEST queue (hard rule #2).
 */
@Module({
  imports: [OrchestratorModule],
  controllers: [SignalsController],
  providers: [SignalScorerService, SignalScorerProcessor],
  exports: [SignalScorerService],
})
export class SignalScorerModule {}
