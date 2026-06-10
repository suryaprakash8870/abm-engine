import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, desc, eq, gte } from 'drizzle-orm';
import {
  accounts,
  actionLog,
  createDb,
  orchestratorRules,
  organizations,
  scores,
  type OrchestratorRule,
} from '@abm/db';
import { DB_TOKEN } from '../../common/db/db.module';
import { CrmAdapterFactory } from '../crm-adapter/crm-adapter.factory';

type DbHandle = ReturnType<typeof createDb>;

export interface RuleCondition {
  minFitScore?: number;
  minSignalScore?: number;
  tierIn?: number[];
  awarenessStageIn?: string[];
  signalTypeIs?: string;
}

export type RuleAction =
  | { type: 'slack' }
  | { type: 'crm-task'; subjectTemplate?: string }
  | { type: 'email-sequence'; sequenceId?: string };

export interface EvaluationContext {
  signalType?: string;
  signalScore?: number;
  awarenessStage?: string;
  stageChanged?: boolean;
}

/** A rule won't refire for the same account inside this window. */
const COOLDOWN_HOURS = 24;

/**
 * Orchestrator (component 4/5) — the brain. Rules live in `orchestrator_rules`
 * as config (never code); every fired action is audited in `action_log`.
 *
 * GATE: ships with ZERO rules. Nothing fires until a human creates and
 * enables a rule — which per ADR-011 should only happen after the Phase 2
 * awareness-validation gate passes. The engine being ready ≠ the score being
 * trusted.
 */
@Injectable()
export class OrchestratorService {
  private readonly logger = new Logger(OrchestratorService.name);
  private readonly webBaseUrl: string;

  constructor(
    @Inject(DB_TOKEN) private readonly dbHandle: DbHandle,
    private readonly crm: CrmAdapterFactory,
    config: ConfigService,
  ) {
    this.webBaseUrl = config.get<string>('WEB_BASE_URL') ?? 'http://localhost:3000';
  }

  /**
   * Evaluate all enabled rules for an account. Called by the signal processor
   * after every recompute. Returns how many actions fired.
   */
  async evaluateAccount(
    orgId: string,
    accountId: string,
    ctx: EvaluationContext = {},
  ): Promise<{ fired: number }> {
    const db = this.dbHandle.db;

    const rules = await db
      .select()
      .from(orchestratorRules)
      .where(and(eq(orchestratorRules.orgId, orgId), eq(orchestratorRules.enabled, true)));
    if (rules.length === 0) return { fired: 0 };

    const [row] = await db
      .select({
        id: accounts.id,
        name: accounts.name,
        domain: accounts.domain,
        externalCrmId: accounts.externalCrmId,
        externalCrmProvider: accounts.externalCrmProvider,
        fitScore: scores.fitScore,
        tier: scores.tier,
        signalScore: scores.signalScore,
        awarenessStage: scores.awarenessStage,
      })
      .from(accounts)
      .leftJoin(scores, and(eq(scores.accountId, accounts.id), eq(scores.orgId, accounts.orgId)))
      .where(and(eq(accounts.orgId, orgId), eq(accounts.id, accountId)))
      .limit(1);
    if (!row) return { fired: 0 };

    const facts = {
      fitScore: row.fitScore ?? 0,
      signalScore: ctx.signalScore ?? row.signalScore ?? 0,
      tier: row.tier,
      awarenessStage: ctx.awarenessStage ?? row.awarenessStage ?? 'identified',
      signalType: ctx.signalType,
    };

    let fired = 0;
    for (const rule of rules) {
      if (!matches(rule.condition as RuleCondition, facts)) continue;
      if (await this.inCooldown(orgId, rule.id, accountId)) continue;

      for (const action of rule.actions as RuleAction[]) {
        const ok = await this.execute(orgId, rule, action, row, facts);
        if (ok) fired += 1;
      }
    }
    return { fired };
  }

  // ── Actions ───────────────────────────────────────────────────────────

  private async execute(
    orgId: string,
    rule: OrchestratorRule,
    action: RuleAction,
    account: {
      id: string;
      name: string | null;
      domain: string;
      externalCrmId: string | null;
      externalCrmProvider: 'hubspot' | 'salesforce' | null;
    },
    facts: { fitScore: number; signalScore: number; tier: number | null; awarenessStage: string; signalType?: string },
  ): Promise<boolean> {
    const label = account.name ?? account.domain;
    try {
      switch (action.type) {
        case 'slack': {
          await this.sendSlack(
            orgId,
            [
              `🔥 *${label}* triggered rule “${rule.name}”`,
              `Tier ${facts.tier ?? '—'} · fit ${facts.fitScore} · signal ${facts.signalScore} · stage *${facts.awarenessStage}*`,
              facts.signalType ? `Latest signal: \`${facts.signalType}\`` : null,
              `${this.webBaseUrl}/accounts/${account.id}`,
            ]
              .filter(Boolean)
              .join('\n'),
          );
          break;
        }
        case 'crm-task': {
          if (!account.externalCrmId || !account.externalCrmProvider) {
            throw new Error('account has no CRM record — cannot create task');
          }
          const subject = (action.subjectTemplate ?? 'High-intent signal: {account}').replace(
            '{account}',
            label,
          );
          await this.crm.forProvider(account.externalCrmProvider).createTask({
            subject,
            body:
              `ABM Engine: rule “${rule.name}” fired.\n` +
              `Tier ${facts.tier ?? '—'} | fit ${facts.fitScore} | signal ${facts.signalScore} | stage ${facts.awarenessStage}` +
              (facts.signalType ? ` | latest: ${facts.signalType}` : ''),
            dueAt: new Date(Date.now() + 24 * 3600 * 1000),
            associatedAccountExternalId: account.externalCrmId,
          });
          break;
        }
        case 'email-sequence': {
          // Stub until an outreach provider is chosen + paid (Smartlead vs
          // Instantly — open decision, verify pricing first). Logged as sent
          // so the audit trail shows the play would have run.
          this.logger.warn(
            `email-sequence action (rule "${rule.name}", account ${label}) — no outreach provider configured; skipping send`,
          );
          break;
        }
      }
      await this.log(orgId, rule.id, account.id, action.type, 'sent', { facts });
      return true;
    } catch (err) {
      this.logger.warn(
        `Action ${action.type} failed (rule "${rule.name}", account ${label}): ${(err as Error).message}`,
      );
      await this.log(orgId, rule.id, account.id, action.type, 'failed', {
        error: (err as Error).message,
      });
      return false;
    }
  }

  private async sendSlack(orgId: string, text: string): Promise<void> {
    const [org] = await this.dbHandle.db
      .select({ slackWebhookUrl: organizations.slackWebhookUrl })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);
    if (!org?.slackWebhookUrl) {
      throw new Error('No Slack webhook configured — set it in /settings');
    }
    const res = await fetch(org.slackWebhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) throw new Error(`Slack webhook → ${res.status}`);
  }

  // ── Audit + cooldown ──────────────────────────────────────────────────

  private async log(
    orgId: string,
    ruleId: string,
    accountId: string,
    action: string,
    status: 'sent' | 'failed',
    detail: Record<string, unknown>,
  ): Promise<void> {
    await this.dbHandle.db
      .insert(actionLog)
      .values({ orgId, ruleId, accountId, action, status, detail });
  }

  private async inCooldown(orgId: string, ruleId: string, accountId: string): Promise<boolean> {
    const since = new Date(Date.now() - COOLDOWN_HOURS * 3600 * 1000);
    const [recent] = await this.dbHandle.db
      .select({ id: actionLog.id })
      .from(actionLog)
      .where(
        and(
          eq(actionLog.orgId, orgId),
          eq(actionLog.ruleId, ruleId),
          eq(actionLog.accountId, accountId),
          eq(actionLog.status, 'sent'),
          gte(actionLog.createdAt, since),
        ),
      )
      .limit(1);
    return Boolean(recent);
  }

  /** Recent action log for the UI. */
  async recentActions(orgId: string, limit = 50) {
    return this.dbHandle.db
      .select()
      .from(actionLog)
      .where(eq(actionLog.orgId, orgId))
      .orderBy(desc(actionLog.createdAt))
      .limit(Math.min(limit, 200));
  }

  /** Kept for backward compatibility with the Phase 0 stub signature. */
  async evaluate(accountId: string): Promise<void> {
    this.logger.warn(`evaluate(${accountId}) called without orgId — use evaluateAccount(orgId, accountId)`);
  }
}

function matches(
  cond: RuleCondition,
  facts: { fitScore: number; signalScore: number; tier: number | null; awarenessStage: string; signalType?: string },
): boolean {
  if (cond.minFitScore !== undefined && facts.fitScore < cond.minFitScore) return false;
  if (cond.minSignalScore !== undefined && facts.signalScore < cond.minSignalScore) return false;
  if (cond.tierIn !== undefined && (facts.tier === null || !cond.tierIn.includes(facts.tier))) return false;
  if (cond.awarenessStageIn !== undefined && !cond.awarenessStageIn.includes(facts.awarenessStage)) return false;
  if (cond.signalTypeIs !== undefined && facts.signalType !== cond.signalTypeIs) return false;
  return true;
}
