import { Inject, Injectable, Logger } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { accounts, createDb } from '@abm/db';
import { DB_TOKEN } from '../../common/db/db.module';
import { ScoringService } from '../scoring/scoring.service';

type DbHandle = ReturnType<typeof createDb>;

/**
 * 30 synthetic B2B companies that deliberately span the full scoring range.
 * Split: ~8 T1 (fit ≥ 75), ~8 T2 (50–74), ~8 T3 (25–49), ~6 Drop (<25).
 *
 * Enrichment fields mirror what HubspotAdapter.getAccounts() stores so that
 * ScoringService.applyRubric() scores them identically to real HubSpot data.
 */
const SEED_ACCOUNTS: Array<{
  domain: string;
  name: string;
  enrichment: Record<string, unknown>;
}> = [
  // ── Tier 1 targets (≥75 pts) ─────────────────────────────────────────────
  {
    domain: 'linear.app',
    name: 'Linear',
    enrichment: {
      name: 'Linear',
      domain: 'linear.app',
      industry: 'COMPUTER_SOFTWARE',
      numberofemployees: '150',
      country: 'United States',
      website: 'https://linear.app',
    },
  },
  {
    domain: 'retool.com',
    name: 'Retool',
    enrichment: {
      name: 'Retool',
      domain: 'retool.com',
      industry: 'COMPUTER_SOFTWARE',
      numberofemployees: '400',
      country: 'United States',
      website: 'https://retool.com',
    },
  },
  {
    domain: 'posthog.com',
    name: 'PostHog',
    enrichment: {
      name: 'PostHog',
      domain: 'posthog.com',
      industry: 'COMPUTER_SOFTWARE',
      numberofemployees: '80',
      country: 'United States',
      website: 'https://posthog.com',
    },
  },
  {
    domain: 'dbt.io',
    name: 'dbt Labs',
    enrichment: {
      name: 'dbt Labs',
      domain: 'dbt.io',
      industry: 'COMPUTER_SOFTWARE',
      numberofemployees: '300',
      country: 'United States',
      website: 'https://dbt.io',
    },
  },
  {
    domain: 'mercury.com',
    name: 'Mercury',
    enrichment: {
      name: 'Mercury',
      domain: 'mercury.com',
      industry: 'COMPUTER_SOFTWARE',
      numberofemployees: '200',
      country: 'United States',
      website: 'https://mercury.com',
    },
  },
  {
    domain: 'incident.io',
    name: 'incident.io',
    enrichment: {
      name: 'incident.io',
      domain: 'incident.io',
      industry: 'COMPUTER_SOFTWARE',
      numberofemployees: '60',
      country: 'United Kingdom',
      website: 'https://incident.io',
    },
  },
  {
    domain: 'gitpod.io',
    name: 'Gitpod',
    enrichment: {
      name: 'Gitpod',
      domain: 'gitpod.io',
      industry: 'COMPUTER_SOFTWARE',
      numberofemployees: '90',
      country: 'United States',
      website: 'https://gitpod.io',
    },
  },
  {
    domain: 'zeet.co',
    name: 'Zeet',
    enrichment: {
      name: 'Zeet',
      domain: 'zeet.co',
      industry: 'COMPUTER_SOFTWARE',
      numberofemployees: '120',
      country: 'United States',
      website: 'https://zeet.co',
    },
  },

  // ── Tier 2 (50–74 pts) ───────────────────────────────────────────────────
  {
    domain: 'mixpanel.com',
    name: 'Mixpanel',
    enrichment: {
      name: 'Mixpanel',
      domain: 'mixpanel.com',
      industry: 'INTERNET',
      numberofemployees: '350',
      country: 'United States',
      website: 'https://mixpanel.com',
    },
  },
  {
    domain: 'hotjar.com',
    name: 'Hotjar',
    enrichment: {
      name: 'Hotjar',
      domain: 'hotjar.com',
      industry: 'INTERNET',
      numberofemployees: '200',
      country: 'United Kingdom',
      website: 'https://hotjar.com',
    },
  },
  {
    domain: 'loom.com',
    name: 'Loom',
    enrichment: {
      name: 'Loom',
      domain: 'loom.com',
      industry: 'INTERNET',
      numberofemployees: '300',
      country: 'United States',
      website: 'https://loom.com',
    },
  },
  {
    domain: 'typeform.com',
    name: 'Typeform',
    enrichment: {
      name: 'Typeform',
      domain: 'typeform.com',
      industry: 'INTERNET',
      numberofemployees: '450',
      country: 'United Kingdom',
      website: 'https://typeform.com',
    },
  },
  {
    domain: 'figma.com',
    name: 'Figma',
    enrichment: {
      name: 'Figma',
      domain: 'figma.com',
      industry: 'COMPUTER_SOFTWARE',
      numberofemployees: '1200',
      country: 'United States',
      website: 'https://figma.com',
    },
  },
  {
    domain: 'miro.com',
    name: 'Miro',
    enrichment: {
      name: 'Miro',
      domain: 'miro.com',
      industry: 'COMPUTER_SOFTWARE',
      numberofemployees: '1800',
      country: 'United States',
      website: 'https://miro.com',
    },
  },
  {
    domain: 'coda.io',
    name: 'Coda',
    enrichment: {
      name: 'Coda',
      domain: 'coda.io',
      industry: 'INTERNET',
      numberofemployees: '250',
      country: 'United States',
      website: 'https://coda.io',
    },
  },
  {
    domain: 'craft.do',
    name: 'Craft',
    enrichment: {
      name: 'Craft',
      domain: 'craft.do',
      industry: 'INTERNET',
      numberofemployees: '70',
      country: 'United Kingdom',
      website: 'https://craft.do',
    },
  },

  // ── Tier 3 (25–49 pts) ───────────────────────────────────────────────────
  {
    domain: 'shopify.com',
    name: 'Shopify',
    enrichment: {
      name: 'Shopify',
      domain: 'shopify.com',
      industry: 'RETAIL',
      numberofemployees: '12000',
      country: 'Canada',
      website: 'https://shopify.com',
    },
  },
  {
    domain: 'squarespace.com',
    name: 'Squarespace',
    enrichment: {
      name: 'Squarespace',
      domain: 'squarespace.com',
      industry: 'RETAIL',
      numberofemployees: '1800',
      country: 'United States',
      website: 'https://squarespace.com',
    },
  },
  {
    domain: 'wix.com',
    name: 'Wix',
    enrichment: {
      name: 'Wix',
      domain: 'wix.com',
      industry: 'RETAIL',
      numberofemployees: '5000',
      country: 'Israel',
      website: 'https://wix.com',
    },
  },
  {
    domain: 'godaddy.com',
    name: 'GoDaddy',
    enrichment: {
      name: 'GoDaddy',
      domain: 'godaddy.com',
      industry: 'RETAIL',
      numberofemployees: '8000',
      country: 'United States',
      website: 'https://godaddy.com',
    },
  },
  {
    domain: 'etsy.com',
    name: 'Etsy',
    enrichment: {
      name: 'Etsy',
      domain: 'etsy.com',
      industry: 'RETAIL',
      numberofemployees: '3000',
      country: 'United States',
      website: 'https://etsy.com',
    },
  },
  {
    domain: 'ebay.com',
    name: 'eBay',
    enrichment: {
      name: 'eBay',
      domain: 'ebay.com',
      industry: 'RETAIL',
      numberofemployees: '11000',
      country: 'United States',
      website: 'https://ebay.com',
    },
  },
  {
    domain: 'wayfair.com',
    name: 'Wayfair',
    enrichment: {
      name: 'Wayfair',
      domain: 'wayfair.com',
      industry: 'RETAIL',
      numberofemployees: '16000',
      country: 'United States',
      website: 'https://wayfair.com',
    },
  },
  {
    domain: 'booking.com',
    name: 'Booking.com',
    enrichment: {
      name: 'Booking.com',
      domain: 'booking.com',
      industry: 'HOSPITALITY',
      numberofemployees: '17000',
      country: 'Netherlands',
      website: 'https://booking.com',
    },
  },

  // ── Drop / below cutoff (<25 pts) ────────────────────────────────────────
  {
    domain: 'deloitte.com',
    name: 'Deloitte',
    enrichment: {
      name: 'Deloitte',
      domain: 'deloitte.com',
      industry: 'ACCOUNTING',
      numberofemployees: '350000',
      country: 'United States',
      website: 'https://deloitte.com',
    },
  },
  {
    domain: 'mckinsey.com',
    name: 'McKinsey & Company',
    enrichment: {
      name: 'McKinsey',
      domain: 'mckinsey.com',
      industry: 'MANAGEMENT_CONSULTING',
      numberofemployees: '40000',
      country: 'United States',
      website: 'https://mckinsey.com',
    },
  },
  {
    domain: 'ford.com',
    name: 'Ford',
    enrichment: {
      name: 'Ford',
      domain: 'ford.com',
      industry: 'AUTOMOTIVE',
      numberofemployees: '180000',
      country: 'United States',
      website: 'https://ford.com',
    },
  },
  {
    domain: 'pfizer.com',
    name: 'Pfizer',
    enrichment: {
      name: 'Pfizer',
      domain: 'pfizer.com',
      industry: 'PHARMACEUTICALS',
      numberofemployees: '80000',
      country: 'United States',
      website: 'https://pfizer.com',
    },
  },
  {
    domain: 'nytimes.com',
    name: 'The New York Times',
    enrichment: {
      name: 'The New York Times',
      domain: 'nytimes.com',
      industry: 'MEDIA_PRODUCTION',
      numberofemployees: '5000',
      country: 'United States',
      website: 'https://nytimes.com',
    },
  },
  {
    domain: 'kroger.com',
    name: 'Kroger',
    enrichment: {
      name: 'Kroger',
      domain: 'kroger.com',
      industry: 'FOOD_BEVERAGES',
      numberofemployees: '430000',
      country: 'United States',
      website: 'https://kroger.com',
    },
  },
];

@Injectable()
export class DevSeedService {
  private readonly logger = new Logger(DevSeedService.name);

  constructor(
    @Inject(DB_TOKEN) private readonly dbHandle: DbHandle,
    private readonly scoring: ScoringService,
  ) {}

  /**
   * Upsert all seed accounts for orgId, then score them.
   * Safe to call multiple times — conflict on (org_id, domain) updates enrichment.
   */
  async seedAccounts(orgId: string): Promise<{ seeded: number; scored: number }> {
    this.logger.log(`Seeding ${SEED_ACCOUNTS.length} synthetic accounts for org ${orgId}`);

    const now = new Date().toISOString();

    for (const a of SEED_ACCOUNTS) {
      await this.dbHandle.db
        .insert(accounts)
        .values({
          orgId,
          domain: a.domain,
          name: a.name,
          externalCrmId: null,
          externalCrmProvider: null,   // synthetic — no real CRM source
          enrichment: a.enrichment,
          enrichedAt: new Date(now),
        })
        .onConflictDoUpdate({
          target: [accounts.orgId, accounts.domain],
          set: {
            name: sql`excluded.name`,
            enrichment: sql`excluded.enrichment`,
            enrichedAt: sql`excluded.enriched_at`,
            updatedAt: sql`now()`,
          },
        });
    }

    this.logger.log('Upsert done. Running scoring…');
    const result = await this.scoring.scoreAccountsForOrg(orgId);

    return { seeded: SEED_ACCOUNTS.length, scored: result.scored };
  }
}
