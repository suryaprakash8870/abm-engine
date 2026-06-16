# Scoring Engine (04)

> Scores and tiers every qualified account. Assigns each company a 0-100 fit score against the ICP, then groups into Tier 1 (70-100), Tier 2 (40-69), Tier 3 (10-39). The scoring formula is AI-generated (Claude Sonnet 4.6) but fully transparent and user-editable — no black boxes.

Full spec: [../../../docs/engines/engine-04-scoring-engine.md](../../../docs/engines/engine-04-scoring-engine.md)

Owner: **<unassigned>** · Status: MVP · Version: 0.1.0

---

## Consumes / Publishes

| Direction | Event | Notes |
|---|---|---|
| Consumes | `accounts.enriched` | Trigger — the enriched/qualified account list from Enrichment (03). Starts the scoring pipeline. |
| Publishes | `accounts.scored` | Success. Consumed by TAL Manager (05). Emitted ONLY after the completion check passes. |
| Publishes | `scoring.failed` | Error. Emitted when the completion check fails. Terminal (no consumer). |

---

## API endpoints to build

Implemented under `app/api/v1/...` (only the health route is scaffolded so far).

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/v1/scoring/generate-formula` | AI-generate formula from ICP |
| `GET`  | `/api/v1/scoring/formula/:icp_id` | Get current formula |
| `PUT`  | `/api/v1/scoring/formula/:id` | Update formula (new version) |
| `POST` | `/api/v1/scoring/run` | Run scoring on all qualified accounts |
| `POST` | `/api/v1/scoring/override` | Manual tier override for an account |
| `GET`  | `/api/v1/scoring/distribution` | Tier distribution stats |
| `GET`  | `/api/v1/scoring-engine/health` | Liveness probe (scaffolded) |

---

## DB tables to model

Defined (commented-out stubs) in `prisma/schema/scoring-engine.prisma`. No other engine queries these directly — they listen to this engine's events and keep local copies.

- `scoring_formulas` — `(id, workspace_id, icp_id, version, criteria JSONB, tier_boundaries JSONB, created_by, created_at)`
- `scoring_formula_versions` — `(id, formula_id, version_number, snapshot JSONB)`
- `account_scores` — `(id, account_id, formula_version, total_score, tier, criterion_scores JSONB, scored_at)`
- `score_history` — `(id, account_id, score, tier, recorded_at)`
- `tier_overrides` — `(id, account_id, tier, reason, overridden_by, overridden_at)`

---

## Task-completion checks (verify-before-publish, ADR-003)

Encoded verbatim in `validation.ts` → `completionCheck()`. Publish `accounts.scored` only when ALL pass; otherwise publish `scoring.failed`.

- [ ] Every qualified account has a score between 0-100 and an assigned tier
- [ ] A score breakdown is stored for every account
- [ ] Tier boundaries are recorded (default or user-adjusted)
- [ ] `accounts.scored` event published and confirmed

> A half-finished job that reports success is worse than a failed job that reports failure.

---

## Build order (mirrors the doc's "How to build it")

1. **Schema first** — fill in the Prisma models in `prisma/schema/scoring-engine.prisma`; add `workspaceId` to every table and a Supabase RLS policy.
2. **Event consumer** — `register()` (in `index.ts`) already subscribes `accounts.enriched`; flesh out the handler in `handlers.ts` (validate the payload before processing).
3. **Core logic** — implement the step-by-step job stubs in `service.ts`:
   - [ ] Step 1 — `getOrGenerateFormula`: active formula for the ICP, else generate via Claude Sonnet 4.6; equal-weight fallback on failure (never block)
   - [ ] Step 2 — `explainFormulaAdjustment`: plain-language weight-change impact (live preview)
   - [ ] Step 3 — `scoreAccounts`: weighted sum of per-criterion matches (1.0 / 0.5 / 0.0) → 0-100
   - [ ] Step 4 — `assignTiers`: configurable cutoffs (default 70/40/10)
   - [ ] Step 5 — `applyTierOverride` + `analyzeOverridePatterns`: logged promote/demote with required reason; Haiku pattern analysis
   - [ ] Step 6 — `storeScoreBreakdowns`: full per-criterion breakdown + `score_history`
   - [ ] Step 7 — `buildTierSummary`: tier counts + top Tier 1 ids
4. **API routes** — implement the endpoints listed above under `app/api/v1/...`.
5. **Event publisher** — `publisher.ts` is ready; call `publishAccountsScored` only after `completionCheck` passes, else `publishScoringFailed`.
6. **Tests** — extend `scoring-engine.test.ts`: drive a known input event end-to-end through the handler and assert the real output payload (currently a // TODO(owner) stub).
7. **Health check** — `GET /api/v1/scoring-engine/health` is scaffolded; surface `last_event_processed_at` from `account_scores`/worker state.

---

## Failure handling

- Claude formula generation fails → use a default equal-weight formula and alert the user. Score every account regardless of formula quality — never block the pipeline.
- Tier override conflicts → user override always wins, logged for formula improvement.

---

## Files in this folder

| File | Purpose |
|---|---|
| `index.ts` | `EngineModule` — slug, consumes/publishes, `register()`, `health()`. |
| `handlers.ts` | One handler per consumed event (`accounts.enriched`). |
| `service.ts` | Core step-by-step job stubs. |
| `publisher.ts` | One thin publisher per published event (`accounts.scored`, `scoring.failed`). |
| `validation.ts` | Per-event payload validators + `completionCheck()`. |
| `scoring-engine.test.ts` | Vitest integration test. |
