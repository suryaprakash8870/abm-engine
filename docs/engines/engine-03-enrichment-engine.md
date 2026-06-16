# Engine 03 — Enrichment Engine

> **Enrich and AI-qualify accounts**
> Category: Data pipeline · Status: MVP
> Owner: _unassigned_ · Last updated: June 2026

---

## Quick reference

| Field | Value |
|---|---|
| Engine number | 03 |
| Consumes (trigger) | `tam.search_completed` event |
| Publishes (output) | `accounts.enriched` |
| Depends on | TAM Builder (02) — needs the raw account list. ICP Engine (01) — needs the ICP definition for qualification context (stored locally via `icp.created`). |
| Feeds | Scoring Engine (04) consumes `accounts.enriched`. |

---

## What this engine does (plain language)

The Enrichment Engine takes the raw company list and fills in every missing detail — industry, size, location, funding, tech stack — then runs AI qualification to remove companies that don't actually match the ICP before they waste anyone's time. The enrichment cache is the single biggest cost-control mechanism in the entire system.

---

## Step-by-step job

1. Receive `tam.search_completed`, process accounts in batches of 25
2. Check the enrichment cache first (30-day firmographic TTL, 90-day technographic TTL) — cache hit means no API call
3. Cache miss: call Apollo enrich for firmographic data, store result in cache immediately
4. If Apollo returns incomplete data: call Clearbit as fallback (~15-20% of accounts)
5. Call BuiltWith for tech stack — only after an ICP pre-filter to save credits
6. Batch-qualify 50 accounts per Claude Haiku call against the ICP definition
7. Flag confidence < 0.4 as 'review recommended' — never auto-disqualify
8. Sample 5% of qualified and disqualified accounts for user spot-check
9. Publish `accounts.enriched` with enriched IDs and a quality summary

---

## LLM model usage

| Task | Model | Why this model |
|---|---|---|
| Account qualification | `Claude Haiku 4.5` | High-volume batch (up to 10k accounts). Haiku at ~$0.0008/qualification means 2,500 accounts ≈ $2. Sonnet would cost 18x more for a binary classification. Tightly-structured prompt so Haiku performs well. |
| Qualification accuracy review | `Claude Sonnet 4.6` | When users flag a result as wrong, Sonnet analyses what the qualification prompt missed. For prompt improvement, not live qualification. |
| Research for sparse company data | `Claude Haiku 4.5` | Infers likely industry/size from company name + description when enrichment APIs return very little. Always flagged 'inferred, not verified'. |

---

## Tools, APIs, and cost

| Tool / API | Purpose | MVP cost |
|---|---|---|
| Apollo.io Enrich API | Firmographic enrichment per domain | Included in Apollo Pro |
| Clearbit API | Enrichment fallback | ~$0.03 per call (~15% of accounts) |
| BuiltWith API | Technographic data | $295/month (shared) |
| Claude Haiku API | Batch qualification | ~$2 per 2,500 accounts |

---

## Database tables (this engine owns)

> Rule: no other engine queries these tables directly. Other engines listen to this engine's events and keep their own local copies.

- `enrichment_jobs (id, workspace_id, source_job_id, status, total, enriched, failed, started_at)`
- `enriched_accounts (id, workspace_id, domain, name, industry, headcount, revenue, geography, funding_stage, tech_stack TEXT[], data_quality_score, enriched_at, enrichment_sources TEXT[])`
- `qualification_results (id, account_id, qualified, confidence, reason, disqualifying_factors TEXT[])`
- `prompt_versions (id, prompt_key, version, content, accuracy_score, created_at)`
- `enrichment_cache (domain PK, firmographics JSONB, technographics JSONB, enriched_at, firmographic_expires_at, technographic_expires_at) — SHARED across workspaces, written only by this engine`

---

## API endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/v1/enrichment/status/:job_id` | Poll enrichment progress |
| `GET` | `/api/v1/accounts` | List enriched accounts with filters |
| `GET` | `/api/v1/accounts/disqualified` | List disqualified accounts for review |
| `POST` | `/api/v1/enrichment/spot-check` | Submit spot-check feedback (correct/wrong) |

---

## User interface

Progress continues from the TAM build bar (Enriching → Qualifying → Done). On completion, a summary card: total found, qualified count, disqualified count, top industries, geography breakdown. A 'Review qualifications' link opens the spot-check view where users confirm or correct AI decisions.

---

## Task completion check

This engine marks its work complete only when ALL of the following are true:

- [ ] Every account has a successful enrichment record OR a documented failure reason
- [ ] AI qualification has run on all enriched accounts
- [ ] Enrichment cache updated for all successfully enriched domains
- [ ] `accounts.enriched` event published and confirmed

> If any check fails, the engine publishes an error event instead of a success event. A half-finished job that reports success is worse than a failed job that reports failure.

---

## Failure handling

Cache miss + Apollo rate limit: queue with backoff. Clearbit 404: mark field as data_quality: missing. Qualification confidence < 0.4: flag 'review recommended', don't auto-disqualify. Cache hit rate < 70%: alert ops. Partial failures acceptable — an account with missing data beats a blocked pipeline.

---

## How to build it (implementation notes for Claude Code)

1. **Schema first** — create the Prisma models for the tables listed above. Add `workspace_id` to every table and a Supabase RLS policy.
2. **Event consumer** — set up a BullMQ worker subscribing to the trigger event(s). Validate the payload before processing.
3. **Core logic** — implement the step-by-step job above as a service module in `lib/engines/enrichment-engine/`.
4. **API routes** — implement the endpoints listed above under `app/api/v1/...`.
5. **Event publisher** — publish the output event only after the task completion check passes.
6. **Tests** — write an integration test that feeds a known input event and asserts the correct output event is published.
7. **Health check** — expose `GET /api/v1/enrichment-engine/health` returning {status, version, db_connected, queue_connected, last_event_processed_at}.

