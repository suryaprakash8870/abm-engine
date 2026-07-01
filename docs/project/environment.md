# Environment Setup

> Never commit real keys. This documents what is needed and where to get it. Actual values live in Vercel env vars and a git-ignored `.env.local`.

## Local setup

```bash
git clone <repo-url> && cd abm-engine
npm install
cp .env.example .env.local      # fill in values below
npx prisma migrate dev          # set up database
npm run dev                     # start app (terminal 1)
npm run worker                  # start BullMQ workers (terminal 2)
```

App runs at http://localhost:3000

## Environment variables

```bash
# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
NODE_ENV=development

# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=          # server-only, never expose to client
DATABASE_URL=                       # Postgres connection string
DIRECT_URL=                         # Postgres direct connection (for migrations)

# Anthropic
ANTHROPIC_API_KEY=                  # sk-ant-...

# Data APIs
APOLLO_API_KEY=
CLEARBIT_API_KEY=
BUILTWITH_API_KEY=
RB2B_API_KEY=

# Prospeo — contact sourcing + email reveal (Apollo alternative, Engine 06).
# Enable by setting BOTH: CONTACT_SOURCE=prospeo and PROSPEO_API_KEY.
# Unset either → contacts use Apollo/mock exactly as before (full rollback).
# PROSPEO_CREDIT_BUDGET caps real credit spend per worker process (default 100).
PROSPEO_API_KEY=
CONTACT_SOURCE=
PROSPEO_CREDIT_BUDGET=

# HubSpot OAuth app
HUBSPOT_CLIENT_ID=
HUBSPOT_CLIENT_SECRET=
HUBSPOT_WEBHOOK_SECRET=

# Salesforce (v1.1)
SALESFORCE_CLIENT_ID=
SALESFORCE_CLIENT_SECRET=

# Slack app
SLACK_CLIENT_ID=
SLACK_CLIENT_SECRET=
SLACK_SIGNING_SECRET=

# Stripe
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_GROWTH_MONTHLY=
STRIPE_PRICE_SCALE_MONTHLY=

# Redis (Upstash)
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=

# Email
RESEND_API_KEY=
EMAIL_FROM=hello@yourdomain.com

# Analytics + errors
NEXT_PUBLIC_POSTHOG_KEY=
NEXT_PUBLIC_POSTHOG_HOST=https://app.posthog.com
NEXT_PUBLIC_SENTRY_DSN=
SENTRY_AUTH_TOKEN=

# Security
ENCRYPTION_KEY=                     # 32-byte hex, generate: openssl rand -hex 32
NEXT_PUBLIC_TRACKER_CDN_URL=        # CDN URL for tracker.js
```

## Where to get each credential

| Service | Where | MVP plan |
|---|---|---|
| Supabase | supabase.com → Settings → API + Database | Pro ($25/mo) |
| Anthropic | console.anthropic.com → API Keys | Pay-per-token. Fund $20+ |
| Apollo | apollo.io → Settings → Integrations → API | Professional ($99/mo) |
| Clearbit | clearbit.com → Account → API Key | Pay-per-use |
| BuiltWith | api.builtwith.com → register | API plan ($295/mo) |
| RB2B | rb2b.com → sign up | Free (100/mo) → $119/mo |
| HubSpot | developers.hubspot.com → Create App (Public) | Free OAuth app |
| Slack | api.slack.com/apps → Create New App | Free |
| Stripe | dashboard.stripe.com → Developers → API Keys | 2.9% + 30c per charge |
| Upstash | upstash.com → Create Redis DB | Pay-as-go (~$10/mo) |
| Resend | resend.com → API Keys | Free (3k/mo) |
| PostHog | posthog.com → Project Settings | Free (1M events) |
| Sentry | sentry.io → Create Project (Next.js) | Free |

## HubSpot OAuth scopes

```
crm.objects.companies.read
crm.objects.companies.write
crm.objects.contacts.read
crm.objects.contacts.write
crm.objects.deals.read
crm.schemas.companies.write
crm.schemas.contacts.write
crm.lists.read
crm.lists.write
webhooks
```
Redirect URL: `https://yourdomain.com/api/v1/oauth/hubspot/callback`

## Slack OAuth scopes

```
chat:write
channels:read
im:write
users:read
```
Enable Interactivity. Request URL: `https://yourdomain.com/api/v1/webhooks/slack/interactive`

## Vercel deployment

Set all env vars in Vercel → Project → Settings → Environment Variables. Server-only secrets (SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY, STRIPE_SECRET_KEY, ENCRYPTION_KEY) must NOT have the `NEXT_PUBLIC_` prefix.

## Key rotation

- `ENCRYPTION_KEY`: rotating requires re-encrypting all stored OAuth tokens — plan carefully.
- OAuth tokens (HubSpot, Salesforce): refreshed automatically in code, no manual rotation.
- Rotate API keys every 90 days as good practice.
