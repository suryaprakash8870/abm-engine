# Engine 04 — Scoring Engine

> **Score and tier every account**
> Category: Intelligence · Status: MVP
> Owner: _unassigned_ · Last updated: June 2026

---

## Quick reference

| Field | Value |
|---|---|
| Engine number | 04 |
| Consumes (trigger) | `accounts.enriched` event |
| Publishes (output) | `accounts.scored` |
| Depends on | Enrichment Engine (03) — needs enriched/qualified accounts. ICP Engine (01) — needs ICP for formula generation. |
| Feeds | TAL Manager (05) consumes `accounts.scored`. |

---

## What this engine does (plain language)

The Scoring Engine assigns each qualified company a 0-100 score based on how closely it matches the ICP, then groups them into Tier 1 (70-100), Tier 2 (40-69), and Tier 3 (10-39). The tier determines how much sales effort each account gets. The scoring formula is AI-generated but fully transparent and user-editable — no black boxes.

---

## Step-by-step job

1. Receive `accounts.enriched`. Generate a scoring formula via Claude Sonnet if none exists for this ICP
2. Present the AI formula to the user for review (weight sliders, live tier-distribution preview)
3. Score every account: weighted sum of per-criterion scores (1.0 perfect / 0.5 partial / 0.0 no match)
4. Assign tiers using configurable cutoffs
5. Offer Tier 1 review mode: user can promote/demote accounts with a logged reason
6. Store a full score breakdown per account (per-criterion contribution)
7. Publish `accounts.scored` with tier summary and top Tier 1 IDs

---

## LLM model usage

| Task | Model | Why this model |
|---|---|---|
| Scoring formula generation | `Claude Sonnet 4.6` | Generates a weighted formula from the ICP with reasoning per criterion. Runs once per ICP version, not per account. ~$0.08 per formula — negligible. |
| Formula adjustment explanation | `Claude Sonnet 4.6` | Explains the likely impact when a user changes weights, in plain language. |
| Manual override analysis | `Claude Haiku 4.5` | Analyses patterns in manual demotions to suggest formula improvements. Low-stakes — Haiku suffices. |

---

## Tools, APIs, and cost

| Tool / API | Purpose | MVP cost |
|---|---|---|
| Claude Sonnet 4.6 | Formula generation + explanation | ~$0.08 per build |
| Claude Haiku 4.5 | Override pattern analysis | ~$0.01 per analysis |
| Custom scoring engine | Weighted score calculation | Free (own code) |
| HubSpot API (via Engine 10) | Write tier + score properties | Free (API) |

---

## Database tables (this engine owns)

> Rule: no other engine queries these tables directly. Other engines listen to this engine's events and keep their own local copies.

- `scoring_formulas (id, workspace_id, icp_id, version, criteria JSONB, tier_boundaries JSONB, created_by, created_at)`
- `scoring_formula_versions (id, formula_id, version_number, snapshot JSONB)`
- `account_scores (id, account_id, formula_version, total_score, tier, criterion_scores JSONB, scored_at)`
- `score_history (id, account_id, score, tier, recorded_at)`
- `tier_overrides (id, account_id, tier, reason, overridden_by, overridden_at)`

---

## API endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/v1/scoring/generate-formula` | AI-generate formula from ICP |
| `GET` | `/api/v1/scoring/formula/:icp_id` | Get current formula |
| `PUT` | `/api/v1/scoring/formula/:id` | Update formula (new version) |
| `POST` | `/api/v1/scoring/run` | Run scoring on all qualified accounts |
| `POST` | `/api/v1/scoring/override` | Manual tier override for an account |
| `GET` | `/api/v1/scoring/distribution` | Tier distribution stats |

---

## User interface

A formula editor where each criterion has a weight slider and the tier distribution updates live as weights change ('127 Tier 1 / 340 Tier 2 / 210 Tier 3'). Each account has a drill-down score breakdown showing exactly how every criterion contributed. Tier 1 review mode is a table with promote/demote buttons and a required reason field.

---

## Task completion check

This engine marks its work complete only when ALL of the following are true:

- [ ] Every qualified account has a score between 0-100 and an assigned tier
- [ ] A score breakdown is stored for every account
- [ ] Tier boundaries are recorded (default or user-adjusted)
- [ ] `accounts.scored` event published and confirmed

> If any check fails, the engine publishes an error event instead of a success event. A half-finished job that reports success is worse than a failed job that reports failure.

---

## Failure handling

Claude formula generation fails: use a default equal-weight formula and alert the user. Score all accounts regardless of formula quality — never block the pipeline. Tier override conflicts: user override always wins, logged for formula improvement.

---

## How to build it (implementation notes for Claude Code)

1. **Schema first** — create the Prisma models for the tables listed above. Add `workspace_id` to every table and a Supabase RLS policy.
2. **Event consumer** — set up a BullMQ worker subscribing to the trigger event(s). Validate the payload before processing.
3. **Core logic** — implement the step-by-step job above as a service module in `lib/engines/scoring-engine/`.
4. **API routes** — implement the endpoints listed above under `app/api/v1/...`.
5. **Event publisher** — publish the output event only after the task completion check passes.
6. **Tests** — write an integration test that feeds a known input event and asserts the correct output event is published.
7. **Health check** — expose `GET /api/v1/scoring-engine/health` returning {status, version, db_connected, queue_connected, last_event_processed_at}.

