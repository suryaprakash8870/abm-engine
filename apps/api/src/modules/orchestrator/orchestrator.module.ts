import { Module } from '@nestjs/common';
import { OrchestratorService } from './orchestrator.service';

/**
 * Orchestrator (component 4/5).
 *
 * Rules engine: "if score > X and signal = Y → Slack alert + CRM task".
 * The brain that turns scores+signals into actions.
 *
 * Phase 0: empty stub. Phase 3 only — gated on the Awareness-Score validation
 * (see CLAUDE.md "Validation gate"). Do NOT wire actions until the gate passes.
 */
@Module({
  providers: [OrchestratorService],
  exports: [OrchestratorService],
})
export class OrchestratorModule {}
