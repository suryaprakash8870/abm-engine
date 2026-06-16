/**
 * Industry benchmark ICP templates (GET /api/v1/icp/templates).
 *
 * Starting points a no-data user can pick to seed the wizard. Not full ICPs — they
 * pre-fill firmographic defaults; the wizard + Claude refine them.
 */

export interface IcpTemplate {
  id: string;
  name: string;
  description: string;
  defaults: {
    industries: string[];
    employee_min: number;
    employee_max: number;
    business_model: string;
  };
}

export const ICP_TEMPLATES: IcpTemplate[] = [
  {
    id: 'b2b-saas-midmarket',
    name: 'B2B SaaS — Mid-market',
    description: 'Software vendors selling to 51–1000 employee companies.',
    defaults: { industries: ['Software', 'Information Technology'], employee_min: 51, employee_max: 1000, business_model: 'B2B SaaS' },
  },
  {
    id: 'fintech',
    name: 'Fintech',
    description: 'Financial services and payments companies.',
    defaults: { industries: ['Financial Services', 'Fintech', 'Banking'], employee_min: 50, employee_max: 5000, business_model: 'B2B' },
  },
  {
    id: 'ecommerce-dtc',
    name: 'E-commerce / DTC',
    description: 'Online retailers and direct-to-consumer brands.',
    defaults: { industries: ['Retail', 'E-commerce', 'Consumer Goods'], employee_min: 11, employee_max: 500, business_model: 'B2C' },
  },
  {
    id: 'healthcare',
    name: 'Healthcare & Life Sciences',
    description: 'Providers, payers, and life-sciences organisations.',
    defaults: { industries: ['Healthcare', 'Pharmaceuticals', 'Biotechnology'], employee_min: 100, employee_max: 10000, business_model: 'B2B' },
  },
  {
    id: 'manufacturing',
    name: 'Manufacturing & Industrial',
    description: 'Discrete and process manufacturers.',
    defaults: { industries: ['Manufacturing', 'Industrial Automation'], employee_min: 200, employee_max: 20000, business_model: 'B2B' },
  },
  {
    id: 'agency-services',
    name: 'Agencies & Professional Services',
    description: 'Marketing, consulting, and professional-services firms.',
    defaults: { industries: ['Marketing & Advertising', 'Management Consulting'], employee_min: 11, employee_max: 500, business_model: 'B2B Services' },
  },
];
