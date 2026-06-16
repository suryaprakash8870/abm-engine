# CLAUDE.md

> Project context for Claude Code. Read this first before any task.

## What this project is

A **CRM-agnostic ABM (Account-Based Marketing) intelligence layer**, delivered as SaaS under OneGTMLab. It connects to a customer's existing CRM (HubSpot/Salesforce), enriches and scores their target accounts, tracks buying signals, computes an awareness score, and triggers the right outreach at the right moment.

**It is NOT a CRM.** It sits on top of the customer's CRM as the brain: scoring, signals, awareness, orchestration. Built first as an internal OneGTMLab tool, then productized.

The core loop: *who already bought → what they have in common → find more like them → watch for buying signals → reach out at the right moment → repeat and improve.*

## The 5 components we build

1. **Enrichment** — given a domain, fetch firmographics + technographics (via Apollo/Clearbit API).
2. **Scoring** — apply the ICP rubric → fit score + tier (1/2/3).
3. **Signal Scorer** — ingest 1st/2nd/3rd-party signals, weight them, decay old ones, output a score.
4. **Orchestrator** — rules engine: "if score > X and signal = pricing-visit → Slack alert + CRM task." The brain.
5. **CRM Adapter** — the ONLY piece that talks to HubSpot/Salesforce. Isolated so a new CRM = one new adapter.

## Tech stack (do not deviate without updating DECISIONS.md)

- **Frontend:** Next.js (App Router) + TypeScript + Tailwind + shadcn/ui + Tremor (dashboards)
- **Backend:** NestJS (Node + TypeScript)
- **Database:** PostgreSQL via Supabase (with Row-Level Security for multi-tenancy)
- **ORM:** Drizzle
- **Jobs/Queue:** BullMQ + Redis (mandatory for enrichment/signals — never sync)
- **Auth:** Clerk or Supabase Auth (never roll our own)
- **Fetching/cache (FE):** TanStack Query
- **Hosting:** Vercel (FE), Railway/Fly.io (BE + workers), Supabase (DB)

## Buy vs Build rule

**BUY the plumbing, BUILD the logic.**
- Buy/integrate: CRM (HubSpot/Salesforce), enrichment data (Apollo/Clearbit), contact data (Hunter), ad platforms (LinkedIn/HubSpot Ads), email sending (Smartlead/Instantly), intent data (Bombora/G2), Slack alerts.
- Build ourselves: Win/Loss analysis, ICP model, Scoring, Signal Scorer, Awareness Score, Orchestrator, CRM Adapter, dashboard, write-back.

## Hard rules (violating these breaks the product)

1. **Never build a CRM.** Integrate.
2. **Never enrich/score inside a web request.** Always queue it (BullMQ).
3. **Never hardcode one CRM.** All CRM logic behind the CRM Adapter interface.
4. **Never weight all signals equally.** 1st-party (e.g. pricing-page visit) ≫ 3rd-party (generic intent). Weighting + time-decay required in Signal Scorer.
5. **Multi-tenancy from day one.** Every row tagged `org_id`; enforce with Postgres RLS.
6. **Never store CRM tokens/API keys in plain text.** Encrypt at rest; use a secrets manager.
7. **CRM write-back is upsert, never overwrite.** Match on email/phone. Add fields, never delete existing data.
8. **Don't build the dashboard before the engine works.** Logic must predict revenue first.

## Conventions

- TypeScript everywhere — no plain JS.
- Each of the 5 components is a separate NestJS module with a clear interface.
- CRM Adapter exposes a single interface; HubSpot/Salesforce are implementations behind it.
- Background jobs are idempotent (safe to retry).
- All external API calls (enrichment, CRM) go through a rate-limited, cached wrapper.
- Secrets via environment variables / secrets manager, never committed.

## Validation gate (critical)

Before building the Orchestrator (Phase 3), **validate the Awareness Score against actual closed-won rate.** An unvalidated score is decoration. This gate is non-negotiable.

## Reference docs in this repo

- `DECISIONS.md` — why we chose what we chose (architecture decision record)
- `TODO.md` — phased task list
- `SKILL.md` — reusable workflow/skill for building & extending the engine
- Background docs: functional spec, workflow explainer, tech-stack guide (see project notes)

## Things to verify live (change often — don't trust memory)

Pricing and API limits for Apollo, Clearbit, Bombora, G2, Smartlead/Instantly shift frequently. Verify current details before committing budget or hardcoding rate limits.
