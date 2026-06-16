/**
 * Tests for the ICP Engine (Mode A — Hypothesis wizard).
 *
 *  - catalog match (every engine)
 *  - runIcpSynthesis publishes icp.created from valid wizard answers (Claude + DB mocked)
 *  - invalid synthesis output → icp.error (verify-before-publish, ADR-003)
 *  - routeToMode routing logic
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Shared, mutable mock state (hoisted so the vi.mock factories can read it).
const h = vi.hoisted(() => {
  const validContent: unknown = {
    firmographics: {
      industries: ['Software'],
      employee_min: 51,
      employee_max: 1000,
      geographies: ['North America'],
      business_model: 'B2B SaaS',
    },
    technographics: { required: ['HubSpot'], preferred: ['Segment'], excluded: [] },
    signals: { high_intent: ['pricing page visit'], medium_intent: ['blog read'] },
    exclusions: { industries: ['Government'], disqualifiers: ['<10 employees'] },
    criteria_confidence: { firmographics: 0.9, technographics: 0.6, signals: 0.7, exclusions: 0.5 },
    rationale: 'Mid-market SaaS fits best.',
  };
  return { validContent, toolInput: validContent as unknown };
});

vi.mock('../../clients/anthropic', () => ({
  MODELS: { reasoning: 'claude-sonnet-4-6', batch: 'claude-haiku-4-5' },
  anthropic: () => ({
    messages: {
      create: async () => ({
        content: [{ type: 'tool_use', name: 'emit_icp', input: h.toolInput }],
      }),
    },
  }),
}));

vi.mock('../../db/client', () => ({
  prisma: {
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        icpDefinition: { create: async () => ({ id: 'icp_1', version: 1, mode: 'hypothesis' }) },
        icpVersion: { create: async () => ({}) },
        icpConfidenceHistory: { create: async () => ({}) },
      }),
    wizardSession: { update: async () => ({}) },
    icpDefinition: { findFirst: async () => null },
  },
}));

import { withCapturedEvents } from '../../events';
import { assertMatchesCatalog } from '../contract';
import engine from './index';
import { runIcpSynthesis, routeToMode } from './service';
import { WIZARD_QUESTION_IDS } from './types';

const answers = Object.fromEntries(WIZARD_QUESTION_IDS.map((id) => [id, 'sample answer']));

describe('icp-engine', () => {
  beforeEach(() => {
    h.toolInput = h.validContent;
  });

  it('matches the event catalog', () => {
    expect(() => assertMatchesCatalog(engine)).not.toThrow();
  });

  it('publishes icp.created from valid wizard answers', async () => {
    const published = await withCapturedEvents(async () => {
      await runIcpSynthesis({ workspaceId: 'ws_1', answers, correlationId: 'corr_1' });
    });

    const created = published.find((e) => e.type === 'icp.created');
    expect(created).toBeDefined();
    expect(created!.workspace_id).toBe('ws_1');
    expect(created!.payload).toMatchObject({ icp_id: 'icp_1', version: 1, mode: 'hypothesis' });
    // confidence = mean(0.9, 0.6, 0.7, 0.5) = 0.68
    expect((created!.payload as { confidence_score: number }).confidence_score).toBeCloseTo(0.68, 2);
    expect(published.some((e) => e.type === 'icp.error')).toBe(false);
  });

  it('publishes icp.error (not icp.created) when synthesis output is invalid', async () => {
    h.toolInput = { firmographics: { industries: [] } }; // fails icpContentSchema

    const published = await withCapturedEvents(async () => {
      await runIcpSynthesis({ workspaceId: 'ws_1', answers, correlationId: 'corr_1' });
    });

    expect(published.some((e) => e.type === 'icp.created')).toBe(false);
    expect(published.some((e) => e.type === 'icp.error')).toBe(true);
  });
});

describe('routeToMode', () => {
  it('routes a user with a CRM and deals to crm_analysis', () => {
    expect(routeToMode({ has_crm: true, has_deals: true, main_goal: 'pipeline' })).toBe('crm_analysis');
  });
  it('routes a user with no deals to hypothesis', () => {
    expect(routeToMode({ has_crm: true, has_deals: false, main_goal: 'pipeline' })).toBe('hypothesis');
    expect(routeToMode({ has_crm: false, has_deals: false, main_goal: 'pipeline' })).toBe('hypothesis');
  });
  it('routes a no-CRM user with deals to csv_import', () => {
    expect(routeToMode({ has_crm: false, has_deals: true, main_goal: 'pipeline' })).toBe('csv_import');
  });
});
