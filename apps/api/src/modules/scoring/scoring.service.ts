import { Injectable, Logger } from '@nestjs/common';
import type { Tier } from '@abm/shared';

@Injectable()
export class ScoringService {
  private readonly logger = new Logger(ScoringService.name);

  async computeFitScore(_accountId: string): Promise<{ fitScore: number; tier: Tier | null }> {
    this.logger.warn('ScoringService.computeFitScore — not implemented (Phase 1)');
    return { fitScore: 0, tier: null };
  }
}
