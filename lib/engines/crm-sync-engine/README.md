# Engine 10 — CRM Sync Engine

> **One-line purpose:** the single place that writes all ABM data back to the CRM (tiers, contacts, scores, play logs) and listens to the CRM for deal changes — centralising CRM I/O so rate limits, token refresh, and the audit log are handled once.

Owner: _unassigned_ · Category: Execution · Status: MVP
Full spec: [../../../docs/engines/engine-10-crm-sync-engine.md](../../../docs/engines/engine-10-crm-sync-engine.md)

---

## Consumes / Publishes

| Direction | Event | Notes |
|---|---|---|
| Consumes | `tal.finalized` | Write TAL tiers / membership to the CRM. |
| Consumes | `contacts.mapped` | Upsert contacts + stakeholder roles. |
| Consumes | `account.score_updated` | Write the latest awareness score/stage. |
| Consumes | `play.fired` | Write the play log (CRM task/note). |
| Publishes | `crm.synced` | Batch write outcome with record counts + errors. |
| Publishes | `crm.deal_closed_won` | From inbound CRM webhook — critical feedback loop → ICP Engine + GTM Flywheel. |
| Publishes | `crm.deal_closed_lost` | From inbound CRM webhook — critical feedback loop → ICP Engine + GTM Flywheel. |

> `crm.deal_closed_won/lost` are produced by the **inbound deal webhook** (HTTP), not by a consumed bus event. `register()` only wires the four consumed events; the webhook route wires the rest.

---

## API endpoints to build

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/v1/oauth/hubspot` | Initiate HubSpot OAuth |
| `GET` | `/api/v1/oauth/hubspot/callback` | Handle OAuth callback |
| `DELETE` | `/api/v1/oauth/hubspot` | Disconnect HubSpot |
| `POST` | `/api/v1/webhooks/hubspot-deals` | Inbound deal change webhook → publishes `crm.deal_closed_won/lost` |
| `GET` | `/api/v1/crm/sync-log` | View sync log |
| `GET` | `/api/v1/crm-sync-engine/health` | Health probe (already scaffolded) |

---

## DB tables to model

Defined (commented) in [`../../../prisma/schema/crm-sync-engine.prisma`](../../../prisma/schema/crm-sync-engine.prisma). Add `workspaceId` + a Supabase RLS policy to every table.

- `crm_connections` — `(id, workspace_id, crm_type, access_token_enc, refresh_token_enc, expires_at, portal_id, instance_url, is_active, connected_at)`
- `sync_jobs` — `(id, workspace_id, sync_type, status, records_total, records_synced, errors)`
- `sync_log` — `(id, workspace_id, record_type, record_id, operation, outcome, api_response, synced_at)`
- `field_mappings` — `(id, workspace_id, crm_type, abm_field, crm_field)`
- `webhook_subscriptions` — `(id, workspace_id, crm_type, event_type, subscription_id)`

---

## Task completion checks (verify before publishing `crm.synced`)

Encoded in [`validation.ts`](./validation.ts) → `completionCheck()`. Publish `crm.synced` only when ALL are true; otherwise publish the engine's error path. A half-finished job that reports success is worse than a failed job that reports failure.

- [ ] All queued writes for a batch confirmed by the CRM API
- [ ] Failed records logged to dead-letter queue with retry status
- [ ] Inbound deal webhooks parsed and corresponding events published
- [ ] `crm.synced` event published with record counts and errors

---

## Build order (mirrors the doc's "How to build it")

- [ ] **Schema first** — fill in the Prisma models in `prisma/schema/crm-sync-engine.prisma`; add `workspaceId` + RLS to each.
- [ ] **Event consumer** — `register()` in `index.ts` already subscribes the four consumed events; flesh out `handlers.ts`.
- [ ] **Core logic** — implement the step-by-step job in `service.ts` (batch by type, Redis token bucket @ 8 req/sec, OAuth refresh + AES-256, webhook subscribe/parse, dead-letter, sync log).
- [ ] **API routes** — implement the OAuth, webhook, and sync-log endpoints under `app/api/v1/...`.
- [ ] **Event publisher** — call the `publisher.ts` helpers only after `completionCheck()` passes (ADR-003).
- [ ] **Tests** — extend `crm-sync-engine.test.ts`: assert real counts/status and add an inbound-webhook → `crm.deal_closed_won/lost` case.
- [ ] **Health check** — `GET /api/v1/crm-sync-engine/health` is scaffolded; surface `last_event_processed_at` from `sync_log`.

---

## Failure handling (from the doc)

- Token expired + refresh fails → mark connection disconnected, alert user (email + in-app banner), queue writes for reconnection.
- HubSpot 500 → retry with 5-min backoff, max 3, then dead-letter.
- Partial batch failure → retry failed records individually.
- Property missing → auto-create then retry.
