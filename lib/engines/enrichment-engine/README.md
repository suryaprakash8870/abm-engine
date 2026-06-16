# Enrichment Engine (03)

> Enriches the raw TAM account list (firmographics, technographics, funding, tech stack) and AI-qualifies each account against the ICP before it wastes anyone's time. The enrichment cache is the single biggest cost-control mechanism in the system.

Full spec: [../../../docs/engines/engine-03-enrichment-engine.md](../../../docs/engines/engine-03-enrichment-engine.md)

Owner: **<unassigned>** · Status: MVP · Version: 0.1.0

---

## Consumes / Publishes

| Direction | Event | Notes |
|---|---|---|
| Consumes | `tam.search_completed` | Trigger — the raw account list from TAM Builder (02). Starts the pipeline. |
| Consumes | `icp.created` | Stores the ICP definition locally for qualification context (no output event). |
| Publishes | `accounts.enriched` | Success. Consumed by Scoring Engine (04). Emitted ONLY after the completion check passes. |
| Publishes | `enrichment.failed` | Error. Emitted when the completion check fails. Terminal (no consumer). |

---

## API endpoints to build

Implemented under `app/api/v1/...` (only the health route is scaffolded so far).

| Method | Path | Description |
|---|---|---|
| `GET`  | `/api/v1/enrichment/status/:job_id` | Poll enrichment progress |
| `GET`  | `/api/v1/accounts` | List enriched accounts with filters |
| `GET`  | `/api/v1/accounts/disqualified` | List disqualified accounts for review |
| `POST` | `/api/v1/enrichment/spot-check` | Submit spot-check feedback (correct/wrong) |
| `GET`  | `/api/v1/enrichment-engine/health` | Liveness probe (scaffolded) |

---

## DB tables to model

Defined (commented-out stubs) in `prisma/schema/enrichment-engine.prisma`. No other engine queries these directly.

- `enrichment_jobs` — `(id, workspace_id, source_job_id, status, total, enriched, failed, started_at)`
- `enriched_accounts` — `(id, workspace_id, domain, name, industry, headcount, revenue, geography, funding_stage, tech_stack[], data_quality_score, enriched_at, enrichment_sources[])`
- `qualification_results` — `(id, account_id, qualified, confidence, reason, disqualifying_factors[])`
- `prompt_versions` — `(id, prompt_key, version, content, accuracy_score, created_at)`
- `enrichment_cache` — `(domain PK, firmographics, technographics, enriched_at, firmographic_expires_at, technographic_expires_at)` — **SHARED across workspaces**, written only by this engine, no `workspace_id`.

---

## Task-completion checks (verify-before-publish, ADR-003)

Encoded verbatim in `validation.ts` → `completionCheck()`. Publish `accounts.enriched` only when ALL pass; otherwise publish `enrichment.failed`.

- [ ] Every account has a successful enrichment record OR a documented failure reason
- [ ] AI qualification has run on all enriched accounts
- [ ] Enrichment cache updated for all successfully enriched domains
- [ ] `accounts.enriched` event published and confirmed

> A half-finished job that reports success is worse than a failed job that reports failure.

---

## Build order (mirrors the doc's "How to build it")

1. **Schema first** — fill in the Prisma models in `prisma/schema/enrichment-engine.prisma`; add `workspaceId` to every table and a Supabase RLS policy (cache excepted).
2. **Event consumer** — `register()` (in `index.ts`) already subscribes `tam.search_completed` + `icp.created`; flesh out the handlers in `handlers.ts` (validate the payload before processing).
3. **Core logic** — implement the step-by-step job stubs in `service.ts`:
   - [ ] Step 1 — `startEnrichmentJob`: open job, batch accounts (25 per batch)
   - [ ] Step 2 — `checkEnrichmentCache`: 30-day firmographic / 90-day technographic TTL
   - [ ] Steps 3-4 — `enrichFirmographics`: Apollo → Clearbit fallback; write cache immediately
   - [ ] Step 5 — `enrichTechStack`: ICP pre-filter, then BuiltWith
   - [ ] Step 6 — `qualifyAccounts`: batch 50/Claude Haiku 4.5 call vs ICP
   - [ ] Step 7 — `flagLowConfidence`: confidence < 0.4 → 'review recommended' (never auto-disqualify)
   - [ ] Step 8 — `sampleForSpotCheck`: 5% of qualified + 5% of disqualified
   - [ ] Step 9 — `buildQualitySummary`: counts, top industries, geography breakdown
4. **API routes** — implement the endpoints listed above under `app/api/v1/...`.
5. **Event publisher** — `publisher.ts` is ready; call `publishAccountsEnriched` only after `completionCheck` passes, else `publishEnrichmentFailed`.
6. **Tests** — extend `enrichment-engine.test.ts`: drive a known input event end-to-end through the handler and assert the real output payload (currently a // TODO(owner) stub).
7. **Health check** — `GET /api/v1/enrichment-engine/health` is scaffolded; surface `last_event_processed_at` from job/worker state.

---

## Files in this folder

| File | Purpose |
|---|---|
| `index.ts` | `EngineModule` — slug, consumes/publishes, `register()`, `health()`. |
| `handlers.ts` | One handler per consumed event. |
| `service.ts` | Core step-by-step job stubs. |
| `publisher.ts` | One thin publisher per published event. |
| `validation.ts` | Per-event payload validators + `completionCheck()`. |
| `enrichment-engine.test.ts` | Vitest integration test. |
