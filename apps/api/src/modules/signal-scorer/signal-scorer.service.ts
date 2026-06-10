import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class SignalScorerService {
  private readonly logger = new Logger(SignalScorerService.name);

  async computeSignalScore(_accountId: string): Promise<number> {
    this.logger.warn('SignalScorerService.computeSignalScore — not implemented (Phase 2)');
    return 0;
  }
}
