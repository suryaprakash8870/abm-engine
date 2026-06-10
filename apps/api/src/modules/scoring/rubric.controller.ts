import { BadRequestException, Body, Controller, Get, NotFoundException, Put } from '@nestjs/common';
import { getCurrentTenant } from '../../common/tenant/tenant-context';
import { ScoringService } from './scoring.service';

/**
 * Rubric editor API (PLAN 1F). Lives at /api/rubric (NOT under /icp — that
 * path is excluded from tenant middleware for the sessionless CSV lab).
 *
 * Saving always creates a NEW version and re-scores the org — edits are
 * append-only for auditability.
 */
@Controller('rubric')
export class RubricController {
  constructor(private readonly scoring: ScoringService) {}

  @Get()
  async getActive() {
    const { orgId } = getCurrentTenant();
    const row = await this.scoring.getActiveRubricRow(orgId);
    if (!row) throw new NotFoundException('No rubric configured for this org yet');
    return { id: row.id, version: row.version, name: row.name, weights: row.weights, createdAt: row.createdAt };
  }

  @Put()
  async save(@Body() body: { name?: string; weights: Record<string, unknown> }) {
    const { orgId } = getCurrentTenant();
    if (!body?.weights || typeof body.weights !== 'object') {
      throw new BadRequestException('weights object required');
    }
    // Minimal shape guard — full Zod validation tracked for Phase 2 polish.
    for (const required of ['industry', 'employeesBands', 'tierThresholds']) {
      if (!(required in body.weights)) {
        throw new BadRequestException(`weights.${required} is required (see current rubric for shape)`);
      }
    }
    return this.scoring.saveRubricVersion(orgId, body.name ?? 'Edited rubric', body.weights);
  }
}
