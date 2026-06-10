import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QUEUES } from '../../common/queue/queue.constants';
import { OrchestratorService } from '../orchestrator/orchestrator.service';
import {
  JOB_PROCESS_SIGNAL,
  SignalScorerService,
  type ProcessSignalJobData,
} from './signal-scorer.service';

/**
 * SIGNAL_INGEST worker: recompute the account's rolling score + awareness
 * stage, then hand the result to the orchestrator (which no-ops unless the
 * org has enabled rules — the Phase 2 gate stays respected).
 */
@Processor(QUEUES.SIGNAL_INGEST, { concurrency: 8 })
export class SignalScorerProcessor extends WorkerHost {
  private readonly logger = new Logger(SignalScorerProcessor.name);

  constructor(
    private readonly scorer: SignalScorerService,
    private readonly orchestrator: OrchestratorService,
  ) {
    super();
  }

  async process(job: Job<ProcessSignalJobData>): Promise<unknown> {
    if (job.name !== JOB_PROCESS_SIGNAL) {
      throw new Error(`Unknown job name on signal-ingest queue: ${job.name}`);
    }
    const { orgId, accountId, signalType } = job.data;

    const result = await this.scorer.recomputeForAccount(orgId, accountId);

    const actions = await this.orchestrator.evaluateAccount(orgId, accountId, {
      signalType,
      signalScore: result.signalScore,
      awarenessStage: result.stage,
      stageChanged: result.stageChanged,
    });

    this.logger.debug(
      `[${job.id}] signal=${signalType} account=${accountId} → score=${result.signalScore} stage=${result.stage} actions=${actions.fired}`,
    );
    return { ...result, actionsFired: actions.fired };
  }
}
