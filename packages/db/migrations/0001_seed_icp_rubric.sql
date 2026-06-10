-- ─────────────────────────────────────────────────────────────
-- 0001_seed_icp_rubric.sql
-- Seeds the v1 ICP rubric for the OneGTMLab org. See RUBRIC.md for the
-- field-by-field breakdown. Idempotent: skips insert if (org_id, version)
-- already exists.
--
-- To evolve: never mutate this. Add 0002_update_icp_rubric.sql that
-- inserts a v2 row with the same org_id, bumped version.
-- ─────────────────────────────────────────────────────────────

insert into icp_rubrics (org_id, version, name, weights)
select
  '00000000-0000-0000-0000-000000000001'::uuid,
  1,
  'OneGTMLab v1 (starter)',
  $rubric$
  {
    "version": 1,
    "industry": {
      "COMPUTER_SOFTWARE": 25,
      "INTERNET": 25,
      "INFORMATION_TECHNOLOGY_AND_SERVICES": 25,
      "FINANCIAL_SERVICES": 15,
      "MARKETING_AND_ADVERTISING": 15,
      "MANAGEMENT_CONSULTING": 15
    },
    "industryDefault": 5,
    "consumerIndustries": [
      "RETAIL",
      "FOOD_AND_BEVERAGES",
      "CONSUMER_GOODS",
      "ANIMATION",
      "ENTERTAINMENT",
      "APPAREL_FASHION",
      "RESTAURANTS",
      "LEISURE_TRAVEL_AND_TOURISM"
    ],
    "industryConsumerPoints": 0,
    "industryMissing": 0,
    "employeesBands": [
      { "min": 50,   "max": 500,  "points": 25 },
      { "min": 20,   "max": 49,   "points": 15 },
      { "min": 501,  "max": 1000, "points": 15 },
      { "min": 10,   "max": 19,   "points": 5 },
      { "min": 1001, "max": 5000, "points": 5 }
    ],
    "employeesDefault": 0,
    "country": {
      "US": 20, "United States": 20, "USA": 20,
      "CA": 20, "Canada": 20,
      "GB": 20, "UK": 20, "United Kingdom": 20,
      "DE": 15, "Germany": 15,
      "FR": 15, "France": 15,
      "NL": 15, "Netherlands": 15,
      "IE": 15, "Ireland": 15,
      "AU": 15, "Australia": 15,
      "NZ": 15, "New Zealand": 15,
      "IL": 10, "Israel": 10,
      "SG": 10, "Singapore": 10,
      "SE": 10, "Sweden": 10,
      "DK": 10, "Denmark": 10,
      "FI": 10, "Finland": 10,
      "NO": 10, "Norway": 10,
      "ES": 10, "Spain": 10,
      "IT": 10, "Italy": 10,
      "BE": 10, "Belgium": 10,
      "AT": 10, "Austria": 10,
      "CH": 10, "Switzerland": 10,
      "PL": 10, "Poland": 10,
      "IN": 5, "India": 5,
      "BR": 5, "Brazil": 5,
      "MX": 5, "Mexico": 5
    },
    "countryDefault": 0,
    "countryMissing": 0,
    "crmProvider": {
      "hubspot": 20,
      "salesforce": 15
    },
    "crmProviderDefault": 0,
    "hasWebsitePoints": 10,
    "hasWebsiteMissingPoints": 0,
    "tierThresholds": {
      "tier1": 75,
      "tier2": 50,
      "tier3": 25
    }
  }
  $rubric$::jsonb
where not exists (
  select 1 from icp_rubrics
  where org_id = '00000000-0000-0000-0000-000000000001'::uuid
    and version = 1
);
