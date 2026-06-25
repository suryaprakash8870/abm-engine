# Engine 02 — TAM Builder

> **Source all matching companies**
> Category: Data pipeline · Status: MVP
> Owner: _unassigned_ · Last updated: June 2026

---

## Quick reference

| Field | Value |
|---|---|
| Engine number | 02 |
| Consumes (trigger) | `icp.created` event |
| Publishes (output) | `tam.search_completed` |
| Depends on | ICP Engine (01) — needs a valid ICP definition. |
| Feeds | Enrichment Engine (03) consumes `tam.search_completed`. |

---

## What this engine does (plain language)

The TAM Builder answers: which companies in the world match our ICP? It takes the ICP criteria and searches Apollo's database to build the raw list — casting the widest net possible before the Enrichment Engine starts filtering. Speed and coverage are the goals; quality filtering comes next.

---

## Step-by-step job

1. Receive `icp.created`, extract firmographic criteria (industry, headcount, geography, funding stage, revenue)
2. Map ICP criteria to Apollo API filter parameters
3. Run 2-3 Apollo searches with overlapping parameter combinations to maximise coverage
4. Paginate results up to the workspace account limit (250 / 2,500 / 10,000 by plan)
5. Merge results, deduplicate by normalised domain
6. Merge any user-uploaded account list (CSV) into the raw list
7. Publish `tam.search_completed` with all account IDs
8. Stream live progress to the UI via Server-Sent Events

---

## LLM model usage

| Task | Model | Why this model |
|---|---|---|
| No LLM usage | `N/A` | Search and retrieval is deterministic. LLM usage begins in the Enrichment Engine where reasoning is actually needed. Intentional design — don't use AI where a search API suffices. |

---

## Tools, APIs, and cost

| Tool / API | Purpose | MVP cost |
|---|---|---|
| Apollo.io API | /mixed_companies/search endpoint | Professional: $99/month (shared) |
| BullMQ + Upstash Redis | Job queue for search pagination | ~$10/month |
| Vercel Edge Functions | SSE progress streaming | Included in Vercel Pro |

---

## Database tables (this engine owns)

> Rule: no other engine queries these tables directly. Other engines listen to this engine's events and keep their own local copies.

- `tam_build_jobs (id, workspace_id, icp_id, status, total_found, processed, started_at, completed_at)`
- `apollo_search_results (id, job_id, raw_response JSONB, page_number)`
- `raw_account_list (id, workspace_id, job_id, domain, name, apollo_id, source, created_at)`
- `search_params_log (id, job_id, params JSONB, result_count)`

---

## API endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/v1/tam/build` | Start TAM build job. Body: {icp_id, account_limit} |
| `GET` | `/api/v1/tam/status/:job_id` | Poll job progress |
| `GET` | `/api/v1/tam/progress/:job_id` | SSE stream of live progress |
| `POST` | `/api/v1/tam/upload` | Upload custom account list CSV |

---

## User interface

After the user saves their ICP, a 'Build my account list' button starts the job. The user sees a live progress bar with stages (Searching → Found X companies → Queuing for enrichment) and a running count. No blank waiting screen — always show what's happening.

---

## Task completion check

This engine marks its work complete only when ALL of the following are true:

- [ ] All pagination pages processed
- [ ] Total accounts stored matches expected count
- [ ] Domains deduplicated (UNIQUE constraint on workspace_id + domain holds)
- [ ] `tam.search_completed` event published and confirmed

> If any check fails, the engine publishes an error event instead of a success event. A half-finished job that reports success is worse than a failed job that reports failure.

---

## Failure handling

Apollo rate limit (429): BullMQ backs off exponentially, job runs slower but never fails. Apollo 402 (credit limit): surface plan upgrade prompt. Partial completion: save a progress checkpoint and resume from the last page, not from scratch.

---

## How to build it (implementation notes for Claude Code)

1. **Schema first** — create the Prisma models for the tables listed above. Add `workspace_id` to every table and a Supabase RLS policy.
2. **Event consumer** — set up a BullMQ worker subscribing to the trigger event(s). Validate the payload before processing.
3. **Core logic** — implement the step-by-step job above as a service module in `lib/engines/tam-builder/`.
4. **API routes** — implement the endpoints listed above under `app/api/v1/...`.
5. **Event publisher** — publish the output event only after the task completion check passes.
6. **Tests** — write an integration test that feeds a known input event and asserts the correct output event is published.
7. **Health check** — expose `GET /api/v1/tam-builder/health` returning {status, version, db_connected, queue_connected, last_event_processed_at}.

