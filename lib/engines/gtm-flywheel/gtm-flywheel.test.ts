/**
 * Engine 11 — GTM Flywheel · integration test.
 *
 * Every engine ships ONE integration test (conventions.md): feed a known input
 * event, assert the correct output event is published. Deeper behavioural
 * assertions are left to the owner.
 */

import { describe, it, expect } from 'vitest';
import { fakeEvent, withCapturedEvents } from '../../events';
import { assertMatchesCatalog } from '../contract';
import engine from './index';
import { handleCrmDealClosedWon } from './handlers';

describe('gtm-flywheel engine', () => {
  it('declares events that match the frozen catalog', () => {
    // Test 1: the engine's consumes/publishes must agree with the catalog.
    expect(() => assertMatchesCatalog(engine)).not.toThrow();
  });

  it('publishes flywheel.error when a consumed event payload is invalid', async () => {
    // Test 2: feed a known consumed event through the handler with an invalid
    // payload (verify-before-publish, ADR-003) and assert the engine emits its
    // error event. The success-path publish (flywheel.metrics_updated /
    // icp.refresh_recommended) is wired by the owner once the service layer lands.
    const published = await withCapturedEvents(async () => {
      const event = fakeEvent('crm.deal_closed_won', {
        // Intentionally malformed: missing deal_id/domain/closed_at fails validation.
        deal_id: '',
        crm_type: 'hubspot',
        account_id: null,
        domain: '',
        amount: null,
        stage: 'closed_won',
        closed_at: '',
        owner_id: null,
      });
      await handleCrmDealClosedWon(event);
    });

    expect(published).toContainEqual(expect.objectContaining({ type: 'flywheel.error' }));

    // TODO(owner): add a valid-payload case asserting `flywheel.metrics_updated`
    // and (on every 5th win) `icp.refresh_recommended` are published once the
    // attribution + metrics service steps are implemented.
  });
});
