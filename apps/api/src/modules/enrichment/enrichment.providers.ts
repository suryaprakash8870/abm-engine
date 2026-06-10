import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Normalized enrichment output — identical shape regardless of provider
 * (CLAUDE.md convention: "Output normalized firmographics + technographics
 * regardless of provider").
 */
export interface EnrichedProfile {
  industry?: string;
  employees?: number;
  country?: string;
  website?: string;
  technologies: string[];
  provider: string;
}

export interface EnrichmentProvider {
  readonly name: string;
  readonly isLive: boolean;
  enrichDomain(domain: string): Promise<EnrichedProfile | null>;
}

/**
 * Apollo organization-enrich client. Key-gated per ADR-014 — free tiers have
 * no API access, so this activates only when APOLLO_API_KEY is set (first
 * paying customer). Until then MockEnrichmentProvider keeps the pipeline
 * exercisable end-to-end.
 */
@Injectable()
export class ApolloEnrichmentProvider implements EnrichmentProvider {
  readonly name = 'apollo';
  private readonly logger = new Logger(ApolloEnrichmentProvider.name);
  private readonly apiKey: string | undefined;

  constructor(config: ConfigService) {
    this.apiKey = config.get<string>('APOLLO_API_KEY');
  }

  get isLive(): boolean {
    return Boolean(this.apiKey);
  }

  async enrichDomain(domain: string): Promise<EnrichedProfile | null> {
    if (!this.apiKey) return null;

    const res = await fetch(
      `https://api.apollo.io/api/v1/organizations/enrich?domain=${encodeURIComponent(domain)}`,
      { headers: { 'x-api-key': this.apiKey, accept: 'application/json' } },
    );
    if (!res.ok) {
      this.logger.warn(`Apollo enrich ${domain} → ${res.status}`);
      return null;
    }

    const body = (await res.json()) as {
      organization?: {
        industry?: string;
        estimated_num_employees?: number;
        country?: string;
        website_url?: string;
        technology_names?: string[];
        current_technologies?: Array<{ name: string }>;
      };
    };
    const org = body.organization;
    if (!org) return null;

    return {
      industry: org.industry,
      employees: org.estimated_num_employees,
      country: org.country,
      website: org.website_url,
      technologies:
        org.technology_names ?? org.current_technologies?.map((t) => t.name) ?? [],
      provider: this.name,
    };
  }
}

/**
 * Deterministic synthetic enrichment — same domain always yields the same
 * profile, so scoring stays reproducible across runs (idempotent jobs).
 * Active whenever Apollo isn't configured (ADR-014: mock until paid tier).
 */
@Injectable()
export class MockEnrichmentProvider implements EnrichmentProvider {
  readonly name = 'mock';
  readonly isLive = false;

  private static readonly INDUSTRIES = [
    'Computer Software', 'Information Technology', 'Financial Services',
    'Marketing & Advertising', 'Health Care', 'E-Learning', 'Logistics',
  ];
  private static readonly COUNTRIES = ['United States', 'United Kingdom', 'Germany', 'India', 'Canada'];
  private static readonly TECH_POOL = [
    'HubSpot', 'Salesforce', 'Google Analytics', 'Intercom', 'Stripe',
    'AWS', 'Segment', 'Marketo', 'Zendesk', 'Slack',
  ];

  async enrichDomain(domain: string): Promise<EnrichedProfile> {
    const h = hashCode(domain);
    const pick = <T>(arr: readonly T[], salt: number) => arr[Math.abs(h + salt) % arr.length];
    const techCount = (Math.abs(h) % 4) + 2;
    const technologies = Array.from(
      { length: techCount },
      (_, i) => pick(MockEnrichmentProvider.TECH_POOL, i * 7),
    ).filter((t, i, a) => a.indexOf(t) === i);

    return {
      industry: pick(MockEnrichmentProvider.INDUSTRIES, 1),
      employees: [12, 45, 120, 350, 800, 2400][Math.abs(h) % 6],
      country: pick(MockEnrichmentProvider.COUNTRIES, 3),
      website: `https://${domain}`,
      technologies,
      provider: this.name,
    };
  }
}

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return h;
}
