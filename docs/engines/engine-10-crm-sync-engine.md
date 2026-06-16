# Engine 10 — CRM Sync Engine

> **Write all data back to the CRM**
> Category: Execution · Status: MVP
> Owner: _unassigned_ · Last updated: June 2026

---

## Quick reference

| Field | Value |
|---|---|
| Engine number | 10 |
| Consumes (trigger) | Events from all other engines |
| Publishes (output) | `crm.synced`, `crm.deal_closed_won`, `crm.deal_closed_lost` |
| Depends on | All engines that need CRM writes. Triggered by their events. |
| Feeds | GTM Flywheel (11) and ICP Engine (01) consume `crm.deal_closed_won/lost`. |

---

## What this engine does (plain language)

Every engine produces data that must reach the CRM — tiers, contact roles, scores, play logs, deal changes. The CRM Sync Engine handles all of it in one place. Centralising CRM I/O avoids rate-limit chaos, handles token refresh once, and gives a complete audit log. It also listens to the CRM for deal changes and publishes them as events so the system reacts.

---

## Step-by-step job

1. Consume CRM-write events from all engines (tiers, contacts, play logs, scores)
2. Batch writes by type (HubSpot accepts 100 records per batch call)
3. Enforce rate limits with a Redis token bucket (8 req/sec, 80% of HubSpot's limit)
4. Manage OAuth tokens: auto-refresh on 401, encrypt at rest (AES-256)
5. Subscribe to HubSpot webhooks for deal stage changes
6. Publish `crm.deal_closed_won` / `crm.deal_closed_lost` — the critical feedback loop
7. Handle errors: dead-letter queue for 4xx, exponential backoff for 5xx, auto-create missing properties
8. Maintain a viewable sync log for user-facing debugging

---

## LLM model usage

| Task | Model | Why this model |
|---|---|---|
| No LLM usage | `N/A` | Reliable, accurate, auditable data transfer is the requirement — not reasoning. LLMs would add unpredictability and cost. |

---

## Tools, APIs, and cost

| Tool / API | Purpose | MVP cost |
|---|---|---|
| HubSpot CRM API | All CRM reads/writes | Free (API) |
| Salesforce REST API (v1.1) | Same for Salesforce users | Requires SF API access |
| Zapier App (v1.1) | Inbound deals from non-HubSpot CRMs | Free to build |
| Node.js crypto | AES-256 token encryption | Free (built-in) |
| BullMQ rate limiter | HubSpot rate-limit enforcement | Free (part of BullMQ) |

---

## Database tables (this engine owns)

> Rule: no other engine queries these tables directly. Other engines listen to this engine's events and keep their own local copies.

- `crm_connections (id, workspace_id, crm_type, access_token_enc, refresh_token_enc, expires_at, portal_id, instance_url, is_active, connected_at)`
- `sync_jobs (id, workspace_id, sync_type, status, records_total, records_synced, errors INTEGER)`
- `sync_log (id, workspace_id, record_type, record_id, operation, outcome, api_response JSONB, synced_at)`
- `field_mappings (id, workspace_id, crm_type, abm_field, crm_field)`
- `webhook_subscriptions (id, workspace_id, crm_type, event_type, subscription_id)`

---

## API endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/v1/oauth/hubspot` | Initiate HubSpot OAuth |
| `GET` | `/api/v1/oauth/hubspot/callback` | Handle OAuth callback |
| `DELETE` | `/api/v1/oauth/hubspot` | Disconnect HubSpot |
| `POST` | `/api/v1/webhooks/hubspot-deals` | Inbound deal change webhook |
| `GET` | `/api/v1/crm/sync-log` | View sync log |

---

## User interface

Settings → Integrations: connection status for each CRM (connected / needs attention / disconnected), connect/disconnect buttons, and a sync log link. Settings → CRM Sync Log: a table of every write operation with timestamp, record type, outcome, and error detail so users self-debug without contacting support.

---

## Task completion check

This engine marks its work complete only when ALL of the following are true:

- [ ] All queued writes for a batch confirmed by the CRM API
- [ ] Failed records logged to dead-letter queue with retry status
- [ ] Inbound deal webhooks parsed and corresponding events published
- [ ] `crm.synced` event published with record counts and errors

> If any check fails, the engine publishes an error event instead of a success event. A half-finished job that reports success is worse than a failed job that reports failure.

---

## Failure handling

Token expired + refresh fails: mark connection disconnected, alert user (email + in-app banner), queue writes for when reconnected. HubSpot 500: retry with 5-min backoff, max 3, then dead-letter. Partial batch failure: retry failed records individually. Property missing: auto-create then retry.

---

## How to build it (implementation notes for Claude Code)

1. **Schema first** — create the Prisma models for the tables listed above. Add `workspace_id` to every table and a Supabase RLS policy.
2. **Event consumer** — set up a BullMQ worker subscribing to the trigger event(s). Validate the payload before processing.
3. **Core logic** — implement the step-by-step job above as a service module in `lib/engines/crm-sync-engine/`.
4. **API routes** — implement the endpoints listed above under `app/api/v1/...`.
5. **Event publisher** — publish the output event only after the task completion check passes.
6. **Tests** — write an integration test that feeds a known input event and asserts the correct output event is published.
7. **Health check** — expose `GET /api/v1/crm-sync-engine/health` returning {status, version, db_connected, queue_connected, last_event_processed_at}.

