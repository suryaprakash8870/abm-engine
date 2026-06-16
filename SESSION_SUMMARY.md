# ABM Engine — Session Summary
> Reconstructed from git history · 2026-06-10 → 2026-06-11

---

## What we built (end-to-end)

This session took the ABM Engine from zero to a fully functional product across **5 phases**, covering the backend engine, frontend dashboard, ICP Lab, documentation, and vendor research.

---

## Phase 0 — Monorepo scaffold (`94a4909`)

Set up the entire project skeleton:

- **Monorepo** using npm workspaces: `apps/web`, `apps/api`, `packages/db`, `packages/shared`
- **Frontend**: Next.js 14 App Router + Tailwind + TanStack Query + Supabase SSR client
- **Backend**: NestJS 10 with 5 clean-interface modules:
  - `EnrichmentModule`, `ScoringModule`, `SignalScorerModule`, `OrchestratorModule`, `CrmAdapterModule`
- **Database**: Drizzle ORM, multi-tenant schema (8 tables), `org_id` on every row + Postgres RLS policies (tested with two-org isolation)
- **Security**: `CryptoService` (AES-256-GCM) for CRM token encryption at rest
- **Infra**: `AsyncLocalStorage` tenant context + NestJS middleware; BullMQ queues (enrichment, scoring, signal-ingest, orchestrator, crm-sync) with retry/decay defaults; Docker Compose for local Postgres + Redis

---

## Phase 1 — HubSpot CRM Adapter + CRM Sync (`94a4909`, `57dacfd`)

- `HubspotAdapter` implementing the `CrmAdapter` interface — Salesforce can be dropped in later without touching anything else
- BullMQ `crm-sync` queue + `SyncAccountsFromCrmJob`
- `CrmSyncProcessor` pages through `HubspotAdapter.getAccounts()` and upserts into `accounts` table on `(org_id, domain)` unique key

---

## Phase 2 — Enrichment + Scoring (`f97b5c2`, `0c7a156`)

- **Enrichment**: Apollo/Clearbit enrichment pipeline queued via BullMQ — never runs in a web request
- **ICP Scoring**: rubric-based fit score → tier 1/2/3 assignment
- **Landing page** with live sync progress UX (polling via TanStack Query)
- **Account detail page**: live score breakdown showing each rubric criterion and weight

---

## Phase 3 — Dashboard & Accounts List (`3c406e8`, `c906a18`, `3ed78ea`)

- `AccountsModule` + `GET /api/accounts` — tenant-scoped via `TenantMiddleware` + `AsyncLocalStorage` + RLS (defense-in-depth)
- Surfaces: industry, employees, country, website, fit score, tier
- **UI_FLOW.md** — phase-by-phase user-facing UI map documenting every screen
- Seeded **30 synthetic B2B accounts** for local development
- **Global nav** with breadcrumbs across all pages

---

## Phase 4 — ICP Lab (`1d4578e`, `998e44b`, `f6a0f13`, `dae3305`)

The ICP Lab lets a user upload their closed-won customers and automatically derive an ICP model, then score their pipeline against it.

**Flow**: Upload CSV of closed-won accounts → pattern analysis → derived ICP rubric → score prospects → export results

- `multer` + `csv-parse` for CSV ingestion (added to deps)
- ICP routes excluded from tenant middleware (they need different auth context)
- Export CSV button on the scored prospects view
- Fixed fetch URL issues between Next.js and NestJS ports

---

## Phase 5 — Full Engine Phases 1–4 + Salesforce + TAM (`37d58ea`)

Large commit completing the engine:

- **Auth module** (Clerk integration)
- **Enrichment pipeline** (Apollo first, Clearbit fallback, rate-limited wrapper)
- **Signal Scorer**: 1st/2nd/3rd-party signal ingestion, configurable weights, time-decay
- **Awareness Score**: computed from signal history
- **Orchestrator**: rules engine — `if score > X and signal = pricing-visit → Slack alert + CRM task`
- **TAM calculator** (Total Addressable Market sizing)
- **Salesforce adapter** added alongside HubSpot

---

## Phase 6 — Web Dashboard (`d137a7e`)

Full frontend UI:

- **Dashboard** with Tremor charts (fit score distribution, signal activity, tier breakdown)
- **Rubric editor** — UI to configure ICP rubric criteria and weights
- **Settings page** — CRM connection, API keys, org config
- **TAM surface** — input parameters → market size estimate
- **Auth UI** (Clerk components)
- Signal and awareness stage surfaces

---

## Phase 7 — Docs (`7d29ca8`, `9c809b5`)

- **User guide** (Word docx + screenshots) — end-user walkthrough of every feature
- **PLAN status board** — living document tracking phase completion
- **ADR-018 through ADR-022** — architecture decision records:
  - ADR-018: Signal weighting strategy
  - ADR-019: Awareness score validation gate
  - ADR-020: ICP Lab CSV approach
  - ADR-021: Salesforce adapter design
  - ADR-022: TAM calculation methodology
- **Third-party vendor comparison** — Apollo vs Clearbit vs alternatives, with verified pricing (as of 2026-06-11) and cost summary

---

## Key architectural decisions enforced throughout

| Rule | How enforced |
|---|---|
| Never build a CRM | Only CrmAdapter interface; no CRM logic in engine |
| Never enrich in a web request | All enrichment/scoring via BullMQ queues |
| Never hardcode one CRM | HubspotAdapter + SalesforceAdapter behind one interface |
| Signal weighting + decay | SignalScorer has per-source weights; exponential time decay |
| Multi-tenancy from day one | `org_id` on every table; RLS + AsyncLocalStorage middleware |
| CRM tokens encrypted | AES-256-GCM via CryptoService |
| CRM write-back = upsert | Upsert on `(org_id, domain)` — never overwrites existing data |

---

## Commit log (chronological)

| Commit | Message |
|---|---|
| `94a4909` | chore: phase 0 scaffold + phase 1 hubspot adapter |
| `57dacfd` | feat(crm-sync): hubspot → accounts table bridge |
| `3c406e8` | feat(dashboard): accounts list page with sync button |
| `c906a18` | docs: add UI_FLOW.md — phase-by-phase user-facing UI map |
| `f97b5c2` | feat: scoring + landing page + live sync progress UX |
| `0c7a156` | feat(accounts): account detail page with live score breakdown |
| `3ed78ea` | feat(dev): seed 30 synthetic B2B accounts + global nav with breadcrumbs |
| `1d4578e` | feat(icp-lab): CSV upload → pattern analysis → prospect scoring |
| `998e44b` | fix(icp-lab): exclude icp routes from tenant middleware + fix fetch URL |
| `f6a0f13` | feat(icp-lab): add Export CSV button to scored prospects |
| `dae3305` | chore(deps): add multer + csv-parse for ICP lab CSV upload |
| `37d58ea` | feat(engine): complete Phases 1-4 — auth, enrichment, signals, awareness, orchestrator, TAM, Salesforce |
| `d137a7e` | feat(web): dashboard, rubric editor, settings, TAM, auth UI + signal/stage surfaces |
| `7d29ca8` | docs: user guide (docx + screenshots), PLAN status board, ADR-018..022 |
| `9c809b5` | docs: third-party vendor comparison + cost summary (prices verified 2026-06-11) |

---

## Current state

- Branch: `main` — all pushed to `github.com/suryaprakash8870/abm-engine`
- Engine: complete (Phases 0–4)
- Dashboard: complete
- ICP Lab: complete
- Docs: complete
- Next logical step: connect real Supabase + deploy to Vercel (FE) + Railway (BE)
