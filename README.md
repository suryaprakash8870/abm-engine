# ABM Engine

> End-to-end Account-Based Marketing platform built as 11 independent engines connected by an event bus.

## Start here

| If you want to... | Read |
|---|---|
| Understand the whole system | `docs/project/architecture.md` |
| Know what to build and in what order | `docs/project/plan.md` |
| Pick up a task | `docs/project/todo.md` |
| Understand a specific engine | `docs/engines/engine-NN-*.md` |
| Set up your environment | `docs/project/environment.md` |
| Follow coding conventions | `docs/project/conventions.md` |
| Understand a term | `docs/project/glossary.md` |
| See past decisions | `docs/project/decisions.md` |

Claude Code reads `CLAUDE.md` automatically — that is the primary context file.

## The 11 engines

```
01 ICP Engine          → Build the Ideal Customer Profile
02 TAM Builder         → Source all matching companies
03 Enrichment Engine   → Enrich + AI-qualify accounts
04 Scoring Engine      → Score + tier accounts
05 TAL Manager         → Build/maintain target account list
06 Contact Engine      → Source + map buying committees
07 Signal Engine       → Track buying signals (always-on)
08 Awareness Engine    → Score awareness + route accounts
09 Orchestrator        → Execute the right play
10 CRM Sync Engine     → Write all data back to CRM
11 GTM Flywheel        → Attribution + ICP feedback loop
```

Data flows forward through the pipeline. Feedback flows back, making it a learning flywheel.

## Tech stack

TypeScript · Next.js 14 · Supabase (Postgres + Auth) · Prisma · BullMQ on Upstash Redis · Anthropic Claude API (Sonnet + Haiku) · Vercel · Stripe · Resend · PostHog · Sentry

## Quick start

```bash
npm install
cp .env.example .env.local   # fill in — see docs/project/environment.md
npx prisma migrate dev
npm run dev                  # terminal 1
npm run worker               # terminal 2
```

## The rules that matter most

1. No engine queries another engine's database. Subscribe to events, keep local copies.
2. Engines communicate only through events, never direct API calls.
3. Every table has `workspace_id` + an RLS policy.
4. Verify the task completion check before publishing a success event.
5. Never block the user on AI latency — queue it.
6. All CRM writes go through Engine 10.
7. Haiku for batch, Sonnet for reasoning.

See `CLAUDE.md` for the full set.

## Repository layout

```
app/            Next.js pages + API routes (api/v1/)
components/     UI components (ui/ = shadcn, abm/ = app-specific)
lib/
  engines/      core logic, one folder per engine
  events/       event bus publish/subscribe
  clients/      external API clients
  db/           Prisma client
workers/        BullMQ workers
prisma/         schema + migrations
public/         tracker.js (website snippet)
docs/
  engines/      spec per engine
  project/      architecture, plan, todo, decisions, etc.
```

## Build order

Follow `docs/project/plan.md`. Build engines in dependency order (01 → 11). Engines 01–05 form a complete sellable product on their own. Engines 06–11 layer intelligence and automation on top.

## License

Proprietary. All rights reserved.
