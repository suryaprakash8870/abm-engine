import { Module } from '@nestjs/common';
import { CrmAdapterFactory } from './crm-adapter.factory';
import { HubspotAdapter } from './hubspot/hubspot.adapter';
import { HubspotHttpClient } from './hubspot/hubspot-http-client';
import { SalesforceAdapter } from './salesforce/salesforce.adapter';

/**
 * CRM Adapter (component 5/5) — the ONLY module allowed to talk to a CRM.
 * Hard rule #3 / ADR-003. Adding a new CRM = one new adapter class.
 *
 * Implementations are concrete classes resolved via CrmAdapterFactory by
 * provider name. Nothing outside this module should import HubspotAdapter
 * or SalesforceAdapter directly.
 */
@Module({
  providers: [CrmAdapterFactory, HubspotAdapter, HubspotHttpClient, SalesforceAdapter],
  exports: [CrmAdapterFactory],
})
export class CrmAdapterModule {}
