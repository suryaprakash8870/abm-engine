/**
 * Mode B deal source — closed-won/lost deals from the workspace's CRM.
 *
 * Reading deals needs the workspace's HubSpot OAuth token, which Engine 10
 * (CRM Sync) owns. Until that lands, this throws CrmNotConnectedError so the route
 * returns 424 and the user is steered to the wizard (Mode A) or CSV import (Mode C).
 *
 * INTEGRATION SEAM (when Engine 10 exists): obtain the token via Engine 10 (an
 * event request or a shared read-only accessor — NEVER by querying Engine 10's
 * crm_connections table directly), call HubSpot's deals API with company
 * associations, and normalise into Deal[].
 */

import type { Deal } from './analysis';

export class CrmNotConnectedError extends Error {
  constructor(message = 'CRM not connected') {
    super(message);
    this.name = 'CrmNotConnectedError';
  }
}

export async function fetchClosedDeals(_workspaceId: string): Promise<Deal[]> {
  // TODO(integration with Engine 10): fetch + normalise closed-won/lost deals.
  throw new CrmNotConnectedError(
    'HubSpot is not connected. Connect a CRM (Engine 10) to use Mode B, or use the wizard (Mode A) / CSV import (Mode C).',
  );
}
