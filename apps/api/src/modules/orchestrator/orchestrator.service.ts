import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class OrchestratorService {
  private readonly logger = new Logger(OrchestratorService.name);

  async evaluate(_accountId: string): Promise<void> {
    this.logger.warn('OrchestratorService.evaluate — not implemented (Phase 3, gated)');
  }
}
