import { Module } from '@nestjs/common';
import { CrmAdapterModule } from '../crm-adapter/crm-adapter.module';
import { OrchestratorService } from './orchestrator.service';
import { RulesController } from './rules.controller';

/**
 * Orchestrator (component 4/5).
 *
 * Rules engine: "if score > X and signal = Y → Slack alert + CRM task".
 * Rules live in `orchestrator_rules` (config, never code) and every action
 * is audited in `action_log`.
 *
 * GATE (ADR-011): ships with zero rules — nothing fires until a human enables
 * one, which should only happen after the Phase 2 awareness validation passes.
 */
@Module({
  imports: [CrmAdapterModule],
  controllers: [RulesController],
  providers: [OrchestratorService],
  exports: [OrchestratorService],
})
export class OrchestratorModule {}
