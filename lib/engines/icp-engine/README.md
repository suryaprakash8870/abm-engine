# ICP Engine (01)

> Builds the Ideal Customer Profile — the structured definition of who we should sell to, used as the primary instruction set by every downstream engine.

Spec: [../../../docs/engines/engine-01-icp-engine.md](../../../docs/engines/engine-01-icp-engine.md)
Owner: **_unassigned_**

---

## Consumes / Publishes

The primary build is triggered by **direct user action** over HTTP (wizard / CRM connect / CSV upload), not by an event. In addition, the catalog routes four feedback events here so the ICP can be refreshed and re-versioned over time.

| Direction | Event | From / To |
|---|---|---|
| Consumes | `play.outcome_recorded` | ← Demand Gen Orchestrator (09) |
| Consumes | `crm.deal_closed_won` | ← CRM Sync (10) |
| Consumes | `crm.deal_closed_lost` | ← CRM Sync (10) |
| Consumes | `icp.refresh_recommended` | ← GTM Flywheel (11) |
| Publishes | `icp.created` | → TAM Builder (02), Scoring (04), Enrichment (03) |
| Publishes | `icp.updated` | → TAM Builder (02), Scoring (04), GTM Flywheel (11) |
| Publishes | `icp.error` | (error event — no consumers) |

> The catalog (`lib/events/catalog.ts`) is the source of truth; `assertMatchesCatalog` guards drift.

---

## API endpoints to build

Under `app/api/v1/...` (plus the health route, already scaffolded):

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/v1/icp/wizard` | Submit wizard answers, return ICP draft |
| `POST` | `/api/v1/icp/crm-analysis` | Trigger CRM-analysis ICP generation (async) |
| `POST` | `/api/v1/icp/csv-import` | Upload CSV, start field mapping |
| `GET`  | `/api/v1/icp/:id` | Fetch an ICP definition |
| `PUT`  | `/api/v1/icp/:id` | Update ICP fields (creates new version) |
| `GET`  | `/api/v1/icp/templates` | List industry benchmark templates |
| `GET`  | `/api/v1/icp-engine/health` | Health probe (scaffolded) |

> Hard rule: never enrich/score/synthesise inside a web request — queue the heavy work (BullMQ).

---

## DB tables to model

Defined (commented) in [`../../../prisma/schema/icp-engine.prisma`](../../../prisma/schema/icp-engine.prisma). No other engine queries these directly.

- `icp_definitions` — `(id, workspace_id, version, mode, firmographics, technographics, signals, exclusions, confidence_score, created_at)`
- `icp_versions` — `(id, icp_id, version_number, snapshot, created_at)`
- `wizard_sessions` — `(id, workspace_id, answers, completed_at)`
- `crm_analysis_jobs` — `(id, workspace_id, crm_type, status, deal_count, result)`
- `icp_confidence_history` — `(id, icp_id, confidence_score, recorded_at)`

Every table gets `workspaceId` + a Supabase RLS policy.

---

## Task-completion checks (verify before publish, ADR-003)

Encoded in [`validation.ts`](./validation.ts) → `completionCheck(...)`. ALL must be true before publishing `icp.created` / `icp.updated`; otherwise publish `icp.error`.

- [ ] ICP object passes schema validation against the `ICPDefinition` TypeScript interface
- [ ] `confidence_score` is populated for the ICP **and** every criterion
- [ ] `icp.created` is published **and** confirmed received by a test consumer
- [ ] UI shows 'ICP complete' only after all three above are true

---

## Build order (mirrors the doc's "How to build it")

1. **Schema first** — fill in the Prisma models in `prisma/schema/icp-engine.prisma`; add `workspaceId` + RLS to every table.
2. **Event consumer** — `register()` in [`index.ts`](./index.ts) already wires the four feedback subscriptions; flesh out [`handlers.ts`](./handlers.ts) (validate the payload first).
3. **Core logic** — implement the step-by-step job in [`service.ts`](./service.ts) (routeToMode → synthesise/analyse → buildStructuredIcp → versionAndPersistIcp → reviseIcp).
4. **API routes** — implement the endpoints above under `app/api/v1/...`.
5. **Event publisher** — call [`publisher.ts`](./publisher.ts) helpers ONLY after `completionCheck` passes; otherwise `publishIcpError`.
6. **Tests** — extend [`icp-engine.test.ts`](./icp-engine.test.ts): feed a known input event, assert the correct output event.
7. **Health check** — `GET /api/v1/icp-engine/health` (scaffolded in `app/api/v1/icp-engine/health/route.ts`).

---

## LLM usage (from the spec)

| Task | Model |
|---|---|
| ICP synthesis from wizard answers | `Claude Sonnet 4.6` |
| CRM statistical interpretation | `Claude Sonnet 4.6` |
| AE interview question generation | `Claude Haiku 4.5` |

## Failure handling (from the spec)

- Claude API down → save answers, queue synthesis for retry, show "Generating your ICP — we'll notify you". Never block on AI latency.
- CRM analysis has < 5 deals → route to Mode A (Hypothesis) with a confidence warning.
- HubSpot OAuth fails → fall back to CSV import.
