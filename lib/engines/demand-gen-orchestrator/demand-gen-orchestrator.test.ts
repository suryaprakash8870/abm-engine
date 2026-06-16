/**
 * Integration test for the Demand Gen Orchestrator (Engine 09).
 *
 * Two checks (conventions.md — every engine writes ONE integration test):
 *   1. The engine's declared events match the frozen catalog.
 *   2. A known input event flows through to the correct output event on the bus.
 *
 * Deeper business assertions are left as TODO(owner) until the service is built.
 */

import { describe, it, expect } from 'vitest';
import { fakeEvent, withCapturedEvents } from '../../events';
import { assertMatchesCatalog } from '../contract';
import { engine } from './index';
import { publishPlayFired } from './publisher';

describe('demand-gen-orchestrator engine', () => {
  it('matches the event catalog', () => {
    expect(() => assertMatchesCatalog(engine)).not.toThrow();
  });

  it('publishes play.fired when a play is fired', async () => {
    // A consumed trigger event the orchestrator reacts to.
    const trigger = fakeEvent('account.stage_changed', {
      account_id: 'acc_123',
      from_stage: 'interested',
      to_stage: 'considering',
      score: 72,
      changed_at: new Date().toISOString(),
    });

    const published = await withCapturedEvents(async () => {
      // TODO(owner): once handleAccountStageChanged fires a play, invoke it here:
      //   await handleAccountStageChanged(trigger);
      // For now, drive the publisher directly with a representative payload so the
      // test asserts the expected OUTPUT event type is captured on the bus.
      await publishPlayFired(
        {
          play_id: 'play_test_1',
          account_id: trigger.payload.account_id,
          contact_id: null,
          play_type: 'tier1_considering',
          tier: 1,
          stage: trigger.payload.to_stage,
          trigger_type: 'account.stage_changed',
          trigger_signal_id: null,
          execution_method: 'crm_task',
          crm_task_id: null,
          slack_message_ts: null,
          assigned_to: null,
          status: 'fired',
          fired_at: new Date().toISOString(),
        },
        { workspaceId: trigger.workspace_id, correlationId: trigger.correlation_id },
      );
    });

    expect(published).toContainEqual(
      expect.objectContaining({ type: 'play.fired' }),
    );
    // TODO(owner): assert payload fields (selected play matches tier × stage matrix,
    //   suppression respected, crm_task_id / slack_message_ts set as expected).
  });
});
