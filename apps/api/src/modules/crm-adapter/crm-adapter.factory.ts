import { Injectable } from '@nestjs/common';
import type { CrmAdapter, CrmProvider } from '@abm/shared';
import { HubspotAdapter } from './hubspot/hubspot.adapter';
import { SalesforceAdapter } from './salesforce/salesforce.adapter';

@Injectable()
export class CrmAdapterFactory {
  constructor(
    private readonly hubspot: HubspotAdapter,
    private readonly salesforce: SalesforceAdapter,
  ) {}

  forProvider(provider: CrmProvider): CrmAdapter {
    switch (provider) {
      case 'hubspot':
        return this.hubspot;
      case 'salesforce':
        return this.salesforce;
      default: {
        const _exhaustive: never = provider;
        throw new Error(`Unknown CRM provider: ${String(_exhaustive)}`);
      }
    }
  }
}
