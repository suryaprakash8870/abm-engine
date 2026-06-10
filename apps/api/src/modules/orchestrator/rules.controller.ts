import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';
import { createDb, orchestratorRules } from '@abm/db';
import { DB_TOKEN } from '../../common/db/db.module';
import { getCurrentTenant } from '../../common/tenant/tenant-context';
import { OrchestratorService, type RuleAction } from './orchestrator.service';

type DbHandle = ReturnType<typeof createDb>;

const ACTION_TYPES = new Set(['slack', 'crm-task', 'email-sequence']);

/**
 * Orchestrator rules CRUD — "rules as config" (TODO Phase 3).
 * New rules default to DISABLED: enabling one is the explicit human act that
 * the Phase 2 validation gate hangs on.
 */
@Controller('rules')
export class RulesController {
  constructor(
    @Inject(DB_TOKEN) private readonly dbHandle: DbHandle,
    private readonly orchestrator: OrchestratorService,
  ) {}

  @Get()
  async list() {
    const { orgId } = getCurrentTenant();
    const rules = await this.dbHandle.db
      .select()
      .from(orchestratorRules)
      .where(eq(orchestratorRules.orgId, orgId))
      .orderBy(desc(orchestratorRules.createdAt));
    return { count: rules.length, rules };
  }

  @Get('actions')
  async actions() {
    const { orgId } = getCurrentTenant();
    const rows = await this.orchestrator.recentActions(orgId);
    return { count: rows.length, actions: rows };
  }

  @Post()
  async create(
    @Body()
    body: {
      name: string;
      condition: Record<string, unknown>;
      actions: RuleAction[];
      enabled?: boolean;
    },
  ) {
    const { orgId } = getCurrentTenant();
    if (!body?.name) throw new BadRequestException('name required');
    if (!body.condition || typeof body.condition !== 'object') {
      throw new BadRequestException('condition object required (e.g. { "minFitScore": 80 })');
    }
    if (!Array.isArray(body.actions) || body.actions.length === 0) {
      throw new BadRequestException('actions array required (e.g. [{ "type": "slack" }])');
    }
    for (const a of body.actions) {
      if (!ACTION_TYPES.has((a as { type?: string }).type ?? '')) {
        throw new BadRequestException(`action.type must be one of: ${[...ACTION_TYPES].join(', ')}`);
      }
    }

    const [rule] = await this.dbHandle.db
      .insert(orchestratorRules)
      .values({
        orgId,
        name: body.name,
        condition: body.condition,
        actions: body.actions as Array<Record<string, unknown>>,
        enabled: body.enabled ?? false,
      })
      .returning();
    return rule;
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body()
    body: Partial<{
      name: string;
      condition: Record<string, unknown>;
      actions: Array<Record<string, unknown>>;
      enabled: boolean;
    }>,
  ) {
    const { orgId } = getCurrentTenant();
    const [rule] = await this.dbHandle.db
      .update(orchestratorRules)
      .set({
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.condition !== undefined ? { condition: body.condition } : {}),
        ...(body.actions !== undefined ? { actions: body.actions } : {}),
        ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
        updatedAt: sql`now()`,
      })
      .where(and(eq(orchestratorRules.orgId, orgId), eq(orchestratorRules.id, id)))
      .returning();
    if (!rule) throw new NotFoundException('Rule not found');
    return rule;
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    const { orgId } = getCurrentTenant();
    const deleted = await this.dbHandle.db
      .delete(orchestratorRules)
      .where(and(eq(orchestratorRules.orgId, orgId), eq(orchestratorRules.id, id)))
      .returning({ id: orchestratorRules.id });
    if (deleted.length === 0) throw new NotFoundException('Rule not found');
    return { deleted: true };
  }
}
