# Engine 07 — Signal Engine

> **Track all buying signals in real time**
> Category: Intelligence (always-on) · Status: MVP
> Owner: _unassigned_ · Last updated: June 2026

---

## Quick reference

| Field | Value |
|---|---|
| Engine number | 07 |
| Consumes (trigger) | Website visits, CRM webhooks, email-tool webhooks, scheduled 3rd-party polls |
| Publishes (output) | `signal.received` |
| Depends on | Contact Engine (06) — uses `contacts.mapped` to attribute signals to specific contacts. TAL Manager (05) — needs the account list to match signals against. |
| Feeds | Awareness Engine (08) consumes `signal.received`. |

---

## What this engine does (plain language)

The Signal Engine never stops running. It watches for any sign that a target account is entering a buying window — a pricing page visit, an email reply, a funding round, a relevant job posting. It collects signals from multiple sources, identifies which target account they belong to, deduplicates, and publishes them for the Awareness Engine to score.

---

## Step-by-step job

1. Listen continuously to: JS tracking snippet, CRM webhooks, email-sequence webhooks, scheduled 3rd-party polls
2. Website snippet: receive IP + URL + session, resolve IP to company via RB2B, match to a TAL account
3. Detect high-intent pages (pricing, demo, comparison, ROI calculator) and award higher points
4. Receive CRM webhooks (deal stage changes, email opens/clicks/replies), verify signatures, map to signal schema
5. Normalise every signal to a common schema regardless of source
6. Deduplicate via a 5-minute Redis window (same account + signal type)
7. Poll 3rd-party APIs daily for hiring (PredictLeads) and funding (Crunchbase) signals (v2)
8. Publish `signal.received` for every valid, deduplicated signal

---

## LLM model usage

| Task | Model | Why this model |
|---|---|---|
| Job posting relevance | `Claude Haiku 4.5` | Classifies whether a detected job posting indicates a buying signal for the ICP. Binary — Haiku ideal. |
| Signal context enrichment | `Claude Haiku 4.5` | Extracts relevant context from funding announcements (amount, stage, what it means for buying behaviour). |
| Bot traffic detection | `Rule-based (no LLM)` | User-agent matching + IP reputation. Deterministic — LLM would add latency to a real-time intake endpoint. |

---

## Tools, APIs, and cost

| Tool / API | Purpose | MVP cost |
|---|---|---|
| RB2B API | IP → company identification | Free (100/mo) → $119/mo unlimited |
| Clearbit Reveal | Fallback IP identification | ~$0.10 per lookup (~20%) |
| Upstash Redis | Dedup cache (5-min window) | ~$1/month |
| PredictLeads API (v2) | Hiring signals | ~$200-400/month |
| Crunchbase API (v2) | Funding signals | $29/month |
| Claude Haiku 4.5 | Signal classification | ~$0.005 per classified signal |

---

## Database tables (this engine owns)

> Rule: no other engine queries these tables directly. Other engines listen to this engine's events and keep their own local copies.

- `signals (id, workspace_id, account_id, contact_id, signal_type, signal_source, points_awarded, decay_rate_per_week, page_url, metadata JSONB, dedup_key, occurred_at, received_at)`
- `signal_sources (id, workspace_id, source_type, config JSONB, is_active)`
- `webhook_log (id, source, payload JSONB, signature_valid, processed_at)`
- `tracking_tokens (id, workspace_id, token, created_at)`
- `visitor_sessions (id, workspace_id, session_id, account_id, ip_hash, first_seen, last_seen)`

---

## API endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/v1/signals/track` | Tracking snippet intake (public, workspace token auth) |
| `POST` | `/api/v1/webhooks/hubspot` | HubSpot webhook receiver |
| `POST` | `/api/v1/webhooks/outreach` | Outreach webhook receiver |
| `GET` | `/api/v1/signals/snippet/:token` | Serve the tracking JS snippet |
| `GET` | `/api/v1/signals/account/:account_id` | All signals for an account |

---

## User interface

Settings → Tracking snippet: a one-line code snippet with copy button and platform-specific install guides (Webflow, WordPress, Framer, HTML). A 'Test snippet' button fires a test signal and confirms receipt. A 'Snippet installed' status indicator. Signals appear in the Account Detail signal timeline.

---

## Task completion check

This engine marks its work complete only when ALL of the following are true:

- [ ] A valid signal is matched to a TAL account
- [ ] Signal deduplicated (idempotency key prevents double-counting)
- [ ] Signal normalised to the common schema and stored
- [ ] `signal.received` event published

> If any check fails, the engine publishes an error event instead of a success event. A half-finished job that reports success is worse than a failed job that reports failure.

---

## Failure handling

RB2B identifies unknown company: discard (no account match). HubSpot signature invalid: 401, log attempt. Duplicate event despite cache miss: idempotency key on the signal record prevents double-counting. Bot traffic spike: rate-limit by IP, filter by user agent.

---

## How to build it (implementation notes for Claude Code)

1. **Schema first** — create the Prisma models for the tables listed above. Add `workspace_id` to every table and a Supabase RLS policy.
2. **Event consumer** — set up a BullMQ worker subscribing to the trigger event(s). Validate the payload before processing.
3. **Core logic** — implement the step-by-step job above as a service module in `lib/engines/signal-engine/`.
4. **API routes** — implement the endpoints listed above under `app/api/v1/...`.
5. **Event publisher** — publish the output event only after the task completion check passes.
6. **Tests** — write an integration test that feeds a known input event and asserts the correct output event is published.
7. **Health check** — expose `GET /api/v1/signal-engine/health` returning {status, version, db_connected, queue_connected, last_event_processed_at}.

