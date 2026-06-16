# Migration — from the v0 prototype to the 11-engine architecture

> The repo previously held a **v0 prototype**: a NestJS + Drizzle monorepo with 5 modules
> (`apps/api`, `apps/web`, `packages/db`, `packages/shared`). The team re-architected into
> **11 event-driven engines** on Next.js + Prisma. This doc maps the old code to the new homes so
> you can **port working logic instead of rewriting it**.

## What changed at the stack level

| Concern | v0 prototype | New architecture |
|---|---|---|
| Backend | NestJS (`apps/api`) | Next.js API routes (`app/api/v1`) + BullMQ workers (`workers/`) |
| ORM | Drizzle (`packages/db`) | Prisma (multi-file `prisma/schema/`) |
| Structure | 5 modules in one Nest app | 11 engines in `lib/engines/`, event-only comms |
| Comms | in-process service calls | event bus (BullMQ on Upstash) — no direct engine calls |
| Frontend | `apps/web` | `app/` (App Router at repo root) |
| Shared types | `packages/shared` | `lib/types/`, `lib/events/types.ts` |

The old code now lives in place (`apps/`, `packages/`) and in `legacy/` (old root config/docs), preserved
for reference. It is **superseded** — new work happens at the repo root. Git history holds the full prior state.

## Where the prototype's logic lands

| v0 location | Ports into | Notes |
|---|---|---|
| `apps/api/src/modules/icp-analyzer/*` | **01 ICP Engine** (`lib/engines/icp-engine`) | ICP synthesis/analysis logic; re-wire to publish `icp.created`. |
| `apps/api/src/modules/gtm/tam.service.ts` | **02 TAM Builder** | Apollo search / TAM sizing logic. |
| `apps/api/src/modules/enrichment/*` (processor, providers, service) | **03 Enrichment Engine** | Enrichment waterfall + provider clients; add the shared `enrichment_cache`. |
| `apps/api/src/modules/scoring/*` + `RUBRIC.md` | **04 Scoring Engine** | Rubric → weighted formula + tiering. Reuse the rubric design. |
| `apps/api/src/modules/accounts/*` | **05 TAL Manager** (+ 03 list UI) | Account list/query surface. |
| (new) | **06 Contact Engine** | No v0 equivalent — net new. |
| `apps/api/src/modules/signal-scorer/*` | **07 Signal Engine** (intake) + **08 Awareness Engine** (decay/scoring) | v0 combined them; split: intake/normalise → 07, decay+stage+routing → 08. |
| `apps/api/src/modules/orchestrator/*` (rules) | **09 Demand Gen Orchestrator** | Rules engine + play matrix. |
| `apps/api/src/modules/crm-adapter/*` (hubspot, salesforce, factory) + `crm-sync/*` + `common/crypto` (AES-256-GCM) | **10 CRM Sync Engine** | The adapter pattern + token encryption are directly reusable. All CRM writes centralise here (ADR-005). |
| `apps/api/src/modules/gtm/*` (analytics) + `modules/validation/*` | **11 GTM Flywheel** | Attribution/validation logic. |
| `apps/api/src/common/auth/*` (Supabase), `common/tenant/*` (AsyncLocalStorage + middleware), `common/health/*` | **Foundation** (`lib/db`, RLS, app middleware, per-engine `/health`) | Multi-tenancy + auth become foundation concerns. |
| `apps/api/src/common/queue|redis/*` | **Foundation event bus** (`lib/events/*`, `lib/clients/redis.ts`) | Queue/Redis wiring → the event bus utilities. |
| `packages/db/src/schema/*` (Drizzle) | per-engine `prisma/schema/<slug>.prisma` | Translate Drizzle tables → Prisma models; split by owning engine per `schema.md`. |
| `apps/web/src/app/*` (dashboard, icp, accounts, settings, rubric) | `app/(app)/*` | Port pages/components; swap the API client to the new `/api/v1` routes. |

## Porting checklist (per engine owner)

1. Find your rows in the table above. Open the old files for reference (don't import from them).
2. Lift the **pure logic** (algorithms, provider clients, prompts) into your `service.ts`.
3. Replace Drizzle queries with Prisma against **your** tables only.
4. Replace in-process calls to other modules with **event publish/subscribe**.
5. Delete the dependency on `packages/shared` — use `lib/events/types.ts` and `lib/types/`.
6. Confirm against your engine doc's task-completion check before publishing.

## Running the v0 prototype (if ever needed)

The old monorepo's workspace root was replaced. To run it for reference, check out a pre-migration
commit (e.g. `git log -- apps/api` → the last commit before this migration) in a separate worktree.
The new architecture does not depend on any old code.

## Decision record

The re-architecture rationale is captured in [`decisions.md`](decisions.md) — see ADR-012 (engine
boundaries / monolith deployment), ADR-011 (BullMQ event bus), ADR-010 (schema-per-engine), and
ADR-001 (Next.js full-stack). These supersede the v0 prototype's `legacy/_old-root-docs/DECISIONS.md`.
