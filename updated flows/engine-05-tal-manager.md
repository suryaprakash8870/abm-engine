# Engine 05 — TAL Manager

> **Build and maintain the Target Account List**
> Category: Intelligence · Status: MVP
> Owner: _unassigned_ · Last updated: June 2026

---

## Quick reference

| Field | Value |
|---|---|
| Engine number | 05 |
| Consumes (trigger) | `accounts.scored` event |
| Publishes (output) | `tal.finalized` |
| Depends on | Scoring Engine (04) — needs scored/tiered accounts. |
| Feeds | Contact Engine (06) and CRM Sync (10) consume `tal.finalized`. |

---

## What this engine does (plain language)

The TAL Manager is the keeper of the official target account list. It applies suppression rules (don't contact existing customers or recently lost deals), maintains version history, and pushes the final list to the CRM and ad platforms. It is the authoritative record of 'these are the companies we are actively going after right now'.

---

## Step-by-step job

1. Receive `accounts.scored`, load the full scored list
2. Apply suppression: existing customers, do-not-contact, closed-lost within 6 months, unsubscribed
3. Create a new immutable TAL version with timestamp and account count
4. Prompt the user to review Tier 1 if not yet done (or publish with a 'pending review' flag)
5. Write ICP tier and score to CRM company records (via Engine 10)
6. Create HubSpot active lists (Tier 1, Tier 2, All ABM) that auto-update
7. Queue Tier 1/2 domains for LinkedIn Matched Audience sync (v2)
8. Publish `tal.finalized`

---

## LLM model usage

| Task | Model | Why this model |
|---|---|---|
| No LLM usage | `N/A` | List management, suppression logic, and CRM sync are all deterministic. LLMs would add cost and latency without value. |

---

## Tools, APIs, and cost

| Tool / API | Purpose | MVP cost |
|---|---|---|
| HubSpot Lists API | Create/manage active ABM lists | Free (API) |
| LinkedIn Marketing API (v2) | Sync Tier 1/2 to ad audiences | Free API, requires LinkedIn review |
| HubSpot Ads API | Sync to HubSpot Ads audiences | Requires HubSpot Marketing Hub |

---

## Database tables (this engine owns)

> Rule: no other engine queries these tables directly. Other engines listen to this engine's events and keep their own local copies.

- `target_account_lists (id, workspace_id, name, version, account_count, status, created_at)`
- `tal_accounts (id, tal_id, account_id, tier, added_at) — join table`
- `tal_versions (id, tal_id, version_number, snapshot JSONB, created_at)`
- `suppression_list (id, workspace_id, domain, reason, suppressed_until, created_at)`
- `crm_audience_sync_log (id, tal_id, platform, status, synced_at)`

---

## API endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/v1/tal` | Get current TAL with filters |
| `GET` | `/api/v1/tal/versions` | List TAL versions |
| `POST` | `/api/v1/tal/suppress` | Add account to suppression list |
| `POST` | `/api/v1/tal/finalize` | Finalize and publish the TAL |
| `GET` | `/api/v1/tal/export` | Export TAL as CSV |

---

## User interface

The Accounts List screen: a sortable, filterable table of all TAL accounts (Company, Industry, Headcount, Score, Tier, Stage, Last Signal, Contacts). Filter sidebar by tier/industry/stage/score. Bulk actions: export to CSV, push to HubSpot, move tier. A banner appears when GTM Flywheel recommends an ICP refresh.

---

## Task completion check

This engine marks its work complete only when ALL of the following are true:

- [ ] Suppression rules applied — suppressed accounts removed from active TAL but retained in suppression_list
- [ ] A new immutable TAL version created
- [ ] CRM company properties + active lists written (confirmed via Engine 10)
- [ ] `tal.finalized` event published and confirmed

> If any check fails, the engine publishes an error event instead of a success event. A half-finished job that reports success is worse than a failed job that reports failure.

---

## Failure handling

HubSpot rate limit: batch property writes via Engine 10, queue at safe rate. Custom property missing: create it before writing. User hasn't reviewed Tier 1: publish with an 'unreviewed' flag — don't block the pipeline.

---

## How to build it (implementation notes for Claude Code)

1. **Schema first** — create the Prisma models for the tables listed above. Add `workspace_id` to every table and a Supabase RLS policy.
2. **Event consumer** — set up a BullMQ worker subscribing to the trigger event(s). Validate the payload before processing.
3. **Core logic** — implement the step-by-step job above as a service module in `lib/engines/tal-manager/`.
4. **API routes** — implement the endpoints listed above under `app/api/v1/...`.
5. **Event publisher** — publish the output event only after the task completion check passes.
6. **Tests** — write an integration test that feeds a known input event and asserts the correct output event is published.
7. **Health check** — expose `GET /api/v1/tal-manager/health` returning {status, version, db_connected, queue_connected, last_event_processed_at}.

