import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class EnrichmentService {
  private readonly logger = new Logger(EnrichmentService.name);

  async enrichDomain(_domain: string): Promise<void> {
    this.logger.warn('EnrichmentService.enrichDomain — not implemented (Phase 1)');
  }
}
