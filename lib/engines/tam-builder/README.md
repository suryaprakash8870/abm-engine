# Engine 02 — TAM Builder

> Source all companies in the world that match an ICP — widest net first, quality filtering comes next (Enrichment).

Owner: _unassigned_. Full spec: [../../../docs/engines/engine-02-tam-builder.md](../../../docs/engines/engine-02-tam-builder.md).

## Consumes / Publishes

| Direction | Event | Notes |
|---|---|---|
| Consumes | `icp.created` | Trigger. From ICP Engine (01). Needs a valid ICP definition. |
| Publishes | `tam.search_completed` | Success. Carries all account ids. Enrichment Engine (03) consumes it. |
| Publishes | `tam.search_failed` | Error path. Carries the resume checkpoint (`last_processed_page`, `processed`). |

Emit `tam.search_completed` **only after** `completionCheck` passes (verify-before-publish, ADR-003). Otherwise emit `tam.search_failed`.

## API endpoints to build

Under `app/api/v1/...` (only the health route is scaffolded so far):

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/v1/tam/build` | Start a TAM build job. Body: `{ icp_id, account_limit }`. |
| `GET` | `/api/v1/tam/status/:job_id` | Poll job progress. |
| `GET` | `/api/v1/tam/progress/:job_id` | SSE stream of live progress. |
| `POST` | `/api/v1/tam/upload` | Upload a custom account list (CSV). |
| `GET` | `/api/v1/tam-builder/health` | Health probe (scaffolded — `route.ts`). |

## DB tables to model

In `prisma/schema/tam-builder.prisma` (commented stubs today). Add `workspaceId` + a Supabase RLS policy to every table.

- `tam_build_jobs (id, workspace_id, icp_id, status, total_found, processed, started_at, completed_at)`
- `apollo_search_results (id, job_id, raw_response JSONB, page_number)`
- `raw_account_list (id, workspace_id, job_id, domain, name, apollo_id, source, created_at)` — UNIQUE `(workspace_id, domain)`
- `search_params_log (id, job_id, params JSONB, result_count)`

## Task-completion checks

The engine marks its work complete only when ALL are true (encoded in `validation.ts → completionCheck`):

- [ ] All pagination pages processed
- [ ] Total accounts stored matches expected count
- [ ] Domains deduplicated (UNIQUE constraint on `workspace_id + domain` holds)
- [ ] `tam.search_completed` event published and confirmed

> A half-finished job that reports success is worse than a failed job that reports failure.

## Build order

Mirrors the doc's "How to build it":

1. [ ] **Schema first** — define the Prisma models in `prisma/schema/tam-builder.prisma`; add `workspaceId` + RLS to each.
2. [ ] **Event consumer** — `register()` already subscribes `icp.created` → `handleIcpCreated`; validate the payload before processing.
3. [ ] **Core logic** — implement the step-by-step job in `service.ts` (extract firmographics → map to Apollo filters → run 2-3 overlapping searches → paginate to plan limit → merge + dedupe by domain → fold in CSV → persist).
4. [ ] **API routes** — implement `/api/v1/tam/build`, `/status/:job_id`, `/progress/:job_id` (SSE), `/upload`.
5. [ ] **Event publisher** — publish `tam.search_completed` only after `completionCheck` passes; else `tam.search_failed`.
6. [ ] **Tests** — extend `tam-builder.test.ts`: feed `icp.created`, assert `tam.search_completed` + payload.
7. [ ] **Health check** — `health()` + `GET /api/v1/tam-builder/health` are scaffolded; wire `last_event_processed_at`.

## Failure handling

- Apollo **429** (rate limit): BullMQ backs off exponentially — slower, never fails.
- Apollo **402** (credit limit): surface a plan-upgrade prompt.
- Partial completion: checkpoint per page and resume from the last page, not from scratch.

## Notes

- **No LLM usage** — search/retrieval is deterministic by design. Reasoning starts in Enrichment (03).
- Files in this folder: `index.ts` (engine module), `handlers.ts`, `service.ts`, `publisher.ts`, `validation.ts`, `tam-builder.test.ts`.
