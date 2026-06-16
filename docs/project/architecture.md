# Architecture

> The complete architecture of ABM Engine. Read this alongside `CLAUDE.md` and the per-engine docs in `docs/engines/`.

## Overview

ABM Engine is 11 independent engines connected by an event bus. Each engine:
- owns its own database schema
- exposes its own versioned API
- publishes and/or subscribes to events
- can be built, tested, deployed, and scaled independently

The engines form a pipeline. Data enters at Engine 01 (ICP) and flows forward. Feedback events flow backward (e.g. a closed-won deal flows from Engine 10 back to Engine 01), making the system a learning flywheel.

## System layers

```
┌─────────────────────────────────────────────────┐
│  Client apps (web, future mobile)                │
└───────────────────────┬─────────────────────────┘
                        │
┌───────────────────────▼─────────────────────────┐
│  API Gateway — routing, auth, rate limiting      │
└───────────────────────┬─────────────────────────┘
                        │
┌───────────────────────▼─────────────────────────┐
│  11 Engine services (lib/engines/*)              │
│  each with its own API routes + DB schema        │
└───────────────────────┬─────────────────────────┘
                        │
┌───────────────────────▼─────────────────────────┐
│  Event bus — BullMQ on Upstash Redis Streams     │
│  engine-to-engine communication                  │
└───────────────────────┬─────────────────────────┘
                        │
┌───────────────────────▼─────────────────────────┐
│  PostgreSQL (Supabase) — one schema per engine   │
│  + shared read-only enrichment_cache             │
└─────────────────────────────────────────────────┘
```

## The pipeline flow

```
User action
   │
   ▼ icp.created
[01 ICP] ──────────────────────────────┐
   │ icp.created                        │ icp.created
   ▼                                    ▼
[02 TAM Builder]                  [04 Scoring]  (gets ICP for formula)
   │ tam.search_completed
   ▼
[03 Enrichment]
   │ accounts.enriched
   ▼
[04 Scoring]
   │ accounts.scored
   ▼
[05 TAL Manager]
   │ tal.finalized
   ├──────────────────┐
   ▼                  ▼
[06 Contact]    [10 CRM Sync]  (writes tiers)
   │ contacts.mapped
   ▼
[07 Signal Engine] ◄─── (always-on: website, CRM webhooks, email tools)
   │ signal.received
   ▼
[08 Awareness]
   │ account.stage_changed / account.hot
   ▼
[09 Orchestrator]
   │ play.fired / play.outcome_recorded
   ▼
[10 CRM Sync] ──── crm.deal_closed_won/lost ───┐
   │ crm.synced                                 │
   ▼                                            │
[11 GTM Flywheel] ◄── (listens to ALL events)  │
   │ icp.refresh_recommended                    │
   └────────────────────────────────────────────┘
                   feedback loop back to [01 ICP]
```

## Event bus contracts

Every event is a JSON message: `{ type, payload, workspace_id, correlation_id, timestamp }`.

The `correlation_id` is generated when a user triggers an ICP build and passed through every downstream event. This lets you trace any problem back through the entire pipeline.

| Event | Published by | Consumed by |
|---|---|---|
| `icp.created` | 01 ICP | 02 TAM Builder, 04 Scoring |
| `icp.updated` | 01 ICP | 02, 04, 11 |
| `tam.search_completed` | 02 TAM Builder | 03 Enrichment |
| `accounts.enriched` | 03 Enrichment | 04 Scoring |
| `accounts.scored` | 04 Scoring | 05 TAL Manager |
| `tal.finalized` | 05 TAL Manager | 06 Contact, 10 CRM Sync |
| `contacts.mapped` | 06 Contact | 07 Signal, 10 CRM Sync |
| `signal.received` | 07 Signal | 08 Awareness |
| `account.score_updated` | 08 Awareness | 10 CRM Sync, 11 Flywheel |
| `account.stage_changed` | 08 Awareness | 09 Orchestrator (highest priority) |
| `account.hot` | 08 Awareness | 09 Orchestrator, 11 Flywheel |
| `play.fired` | 09 Orchestrator | 10 CRM Sync, 11 Flywheel |
| `play.outcome_recorded` | 09 Orchestrator | 11 Flywheel, 01 ICP |
| `crm.deal_closed_won` | 10 CRM Sync | 01 ICP, 11 Flywheel |
| `crm.deal_closed_lost` | 10 CRM Sync | 01 ICP, 11 Flywheel |
| `crm.synced` | 10 CRM Sync | 11 Flywheel |
| `icp.refresh_recommended` | 11 Flywheel | 01 ICP, notification service |

## Data ownership

Each engine owns its tables. No cross-engine queries. See each engine doc for its table list, and `docs/project/schema.md` for full schema.

The one shared table is `enrichment_cache` (domain → firmographic + technographic data). It is written only by Engine 03 and read by others via read-only access. It contains no personal data — only public company information — so sharing across workspaces is safe and is the primary cost-control mechanism.

## Multi-tenancy

Every table has a `workspace_id` column. Supabase Row Level Security policies ensure queries only return rows for the authenticated user's workspace. This is enforced at the database level — an application bug cannot leak data across workspaces.

## Deployment model

- **MVP:** all engines run as Next.js API route groups + BullMQ workers on Vercel. One codebase, one deployment. The engine boundaries are enforced in code (separate `lib/engines/*` folders, separate DB schemas, event-only communication) — not yet separate services.
- **Scale (v2):** any engine can be extracted into its own standalone Node.js service in a container (Railway / Fly.io) without changing any other engine, because they only communicate through events. This is the payoff of the discipline in MVP.

## Why this architecture

- **Independent scaling:** the Enrichment Engine (burst processing), Signal Engine (high-frequency events), and GTM Flywheel (heavy analytics) have completely different load profiles. Separating them lets each scale independently.
- **Independent failure:** if one engine is down, others keep working from their local event-sourced copies. The system degrades gracefully.
- **Independent development:** different engines can be built and shipped in parallel without merge conflicts or coordination overhead.
- **Easy expansion:** adding a new signal source or a new play type means touching one engine, not rewiring a monolith.
