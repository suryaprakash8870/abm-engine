# CLAUDE.md

> This file is read automatically by Claude Code at the start of every session. It is the single most important context file. Keep it accurate and concise.

## What this project is

ABM Engine — an end-to-end Account-Based Marketing SaaS platform built as **11 independent engines** (microservices) that communicate through an event bus. Each engine has one job, its own database schema, and its own API. Data flows through them as a pipeline.

Read `docs/project/architecture.md` for the full architecture and `docs/engines/` for the spec of each engine.

## The 11 engines (build in this order)

| # | Engine | Job | Doc |
|---|---|---|---|
| 01 | ICP Engine | Build the Ideal Customer Profile | `docs/engines/engine-01-icp-engine.md` |
| 02 | TAM Builder | Source all matching companies | `docs/engines/engine-02-tam-builder.md` |
| 03 | Enrichment Engine | Enrich + AI-qualify accounts | `docs/engines/engine-03-enrichment-engine.md` |
| 04 | Scoring Engine | Score + tier accounts | `docs/engines/engine-04-scoring-engine.md` |
| 05 | TAL Manager | Build/maintain target account list | `docs/engines/engine-05-tal-manager.md` |
| 06 | Contact Engine | Source + map buying committees | `docs/engines/engine-06-contact-engine.md` |
| 07 | Signal Engine | Track buying signals (always-on) | `docs/engines/engine-07-signal-engine.md` |
| 08 | Awareness Engine | Score awareness + route accounts | `docs/engines/engine-08-awareness-engine.md` |
| 09 | Demand Gen Orchestrator | Execute the right play | `docs/engines/engine-09-demand-gen-orchestrator.md` |
| 10 | CRM Sync Engine | Write all data back to CRM | `docs/engines/engine-10-crm-sync-engine.md` |
| 11 | GTM Flywheel | Attribution + ICP feedback loop | `docs/engines/engine-11-gtm-flywheel.md` |

## Tech stack

- **Language:** TypeScript 5.x (strict mode) everywhere
- **Frontend:** Next.js 14 App Router, Tailwind CSS, shadcn/ui
- **Backend:** Next.js API routes (MVP), Node.js 20
- **Database:** PostgreSQL 15 via Supabase, Prisma ORM
- **Event bus:** BullMQ on Upstash Redis (Redis Streams)
- **AI:** Anthropic Claude API — `claude-sonnet-4-6` (reasoning) and `claude-haiku-4-5` (batch)
- **Auth:** Supabase Auth + Row Level Security
- **Hosting:** Vercel
- **Billing:** Stripe · **Email:** Resend · **Analytics:** PostHog · **Errors:** Sentry

## Non-negotiable architecture rules

1. **No cross-engine database access.** An engine NEVER queries another engine's tables. If it needs data from another engine, it subscribes to that engine's events and stores a local copy.
2. **Engines communicate only through events.** No direct engine-to-engine API calls. Publish events, subscribe to events.
3. **Every table has `workspace_id`** and a Supabase RLS policy. Multi-tenancy is enforced at the database level, not just in application code.
4. **Verify before publishing.** An engine publishes its success event only after its task completion check passes (see each engine doc). A half-finished job reporting success is worse than a failed job reporting failure.
5. **Never block the user on AI latency.** LLM calls are async and queued. Show progress, notify on completion.
6. **Cache enrichment aggressively.** The shared `enrichment_cache` table is the primary cost-control mechanism. Never enrich the same domain twice within its TTL.
7. **Use Haiku for batch, Sonnet for reasoning.** Don't use Sonnet where Haiku suffices — it's 18x more expensive.
8. **All CRM writes go through Engine 10.** No other engine writes to the CRM directly.

## Repository layout

```
app/
  (auth)/                 login, signup
  (app)/                  authenticated app pages
  api/v1/                 API routes, grouped by engine
components/
  ui/                     shadcn/ui components
  abm/                    ABM-specific components
lib/
  engines/                one folder per engine — core logic
    icp-engine/
    tam-builder/
    ...
  events/                 event bus publisher + consumer setup
  clients/                external API clients (apollo, clearbit, hubspot, claude...)
  db/                     Prisma client
workers/                  BullMQ workers, one per engine
prisma/
  schema.prisma
public/
  tracker.js              website tracking snippet
docs/
  engines/                spec for each of the 11 engines
  project/                architecture, decisions, plan, schema, etc.
```

## Conventions

- API routes are versioned: `/api/v1/...`
- Event names use dot notation: `icp.created`, `accounts.enriched`
- Every event payload includes `workspace_id`, `correlation_id`, `timestamp`
- Each engine folder in `lib/engines/` exports a service module + its event handlers
- Prisma model names are PascalCase singular; table names are snake_case plural
- Write an integration test per engine: feed a known input event, assert the correct output event fires

## Commands

```bash
npm run dev          # start Next.js dev server
npm run worker       # start BullMQ workers (separate terminal)
npx prisma migrate dev --name "description"   # create + apply a migration
npx prisma studio    # browse the database
npm run test         # run tests
npm run lint         # lint + typecheck
```

## When building a new engine

1. Read the engine's doc in `docs/engines/` fully before writing code.
2. Create the Prisma models for its tables (with `workspace_id` + RLS).
3. Set up the BullMQ consumer for its trigger event(s).
4. Implement core logic in `lib/engines/<engine-slug>/`.
5. Implement its API routes under `app/api/v1/`.
6. Publish the output event ONLY after the task completion check passes.
7. Write the integration test.
8. Add a health-check endpoint.
9. Update `docs/project/todo.md` — check off completed tasks.
10. If you made an architectural decision, record it in `docs/project/decisions.md`.

## What NOT to do

- Do not write malware, scrapers that violate ToS, or anything that bypasses platform rate limits dishonestly.
- Do not store secrets in code. Use environment variables (see `docs/project/environment.md`).
- Do not query another engine's database tables directly — ever.
- Do not use Sonnet for high-volume batch tasks — use Haiku.
- Do not skip the task completion check before publishing a success event.
