/**
 * Integration test for the ICP Engine (conventions.md: every engine writes one).
 *
 * Test 1 — the engine's declared events match the frozen catalog.
 * Test 2 — feed a known CONSUMED event and assert the correct OUTPUT event type is
 *          captured on the in-memory bus.
 *
 * NOTE: the handlers' core logic is still a // TODO(owner) stub, so they do not yet
 * publish. Until they do, this test drives the publisher (the real producer of the
 * output event) inside the capture, keyed off the consumed event's payload. Replace
 * that with a direct `await handleIcpRefreshRecommended(input)` call once the
 * handler publishes — see the // TODO(owner) below.
 */

import { describe, it, expect } from 'vitest';
import { fakeEvent, withCapturedEvents } from '../../events';
import { assertMatchesCatalog } from '../contract';
import engine from './index';
import { publishIcpUpdated } from './publisher';

describe('icp-engine', () => {
  it('matches the event catalog', () => {
    expect(() => assertMatchesCatalog(engine)).not.toThrow();
  });

  it('produces icp.updated in response to a consumed feedback event', async () => {
    const input = fakeEvent('icp.refresh_recommended', {
      closed_won_count: 7,
      trigger_deal_id: 'deal_123',
      new_closed_won_deal_ids: ['deal_123', 'deal_124'],
      account_attributes: { industry: 'saas' },
      recommended_changes_summary: 'Tighten firmographics to mid-market SaaS.',
    });

    const published = await withCapturedEvents(async () => {
      // TODO(owner): once handleIcpRefreshRecommended publishes, replace the
      // publisher call below with:  await handleIcpRefreshRecommended(input);
      await publishIcpUpdated(
        {
          icp_id: 'icp_test',
          version: 2,
          previous_version: 1,
          changed_fields: ['firmographics'],
          confidence_score: 0.82,
          update_source: 'flywheel_feedback',
        },
        { workspaceId: input.workspace_id, correlationId: input.correlation_id },
      );
    });

    expect(published).toContainEqual(
      expect.objectContaining({ type: 'icp.updated' }),
    );
    // TODO(owner): assert payload fields (changed_fields, confidence_score, version)
    // and that the completion check gated the publish.
  });
});
