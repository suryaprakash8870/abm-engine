# Engine 08 — Awareness Engine

> **Score awareness and route accounts**
> Category: Intelligence · Status: MVP
> Owner: _unassigned_ · Last updated: June 2026

---

## Quick reference

| Field | Value |
|---|---|
| Engine number | 08 |
| Consumes (trigger) | `signal.received` event |
| Publishes (output) | `account.score_updated`, `account.stage_changed`, `account.hot` |
| Depends on | Signal Engine (07) — needs signals. Scoring Engine (04)/TAL (05) — needs account tier (local copy via events). |
| Feeds | Orchestrator (09) and CRM Sync (10) consume the awareness events. |

---

## What this engine does (plain language)

The Awareness Engine turns raw signals into a single number per account: the awareness score, representing how actively a company is in a buying phase right now. It applies time-decay (old signals matter less), manages the five awareness stages, and evaluates the routing rules that automatically tell sales reps when to act.

---

## Step-by-step job

1. Listen to `signal.received`, retrieve the account's current score
2. Add signal points, recalculate time-decayed contribution of all previous signals (cap at 100)
3. Apply per-signal decay rates (funding decays slowly, pricing-page visits decay fast)
4. Check if the new score crosses a stage boundary; if so publish `account.stage_changed`
5. Publish `account.hot` if the score jumps >20 points within 48 hours
6. Evaluate workspace routing rules against the updated score
7. Run a daily decay recalculation job at 00:00 UTC for all accounts
8. Store a daily score snapshot per account for trend charts

---

## LLM model usage

| Task | Model | Why this model |
|---|---|---|
| Account narrative summary | `Claude Sonnet 4.6` | Plain-language summary of an account's signal history for the rep. Generated on demand when a rep views an account — not in the scoring loop. |
| Core scoring + routing | `No LLM (deterministic)` | Scores must be explainable and auditable. A rep asking 'why is this account at 67?' needs a clear signal-history answer, not an AI black box. |

---

## Tools, APIs, and cost

| Tool / API | Purpose | MVP cost |
|---|---|---|
| Custom decay engine | Score calculation with time-decay | Free (own code) |
| BullMQ scheduled job | Daily decay recalculation | Included in BullMQ |
| Claude Sonnet 4.6 | On-demand account narrative | ~$0.01 per narrative |

---

## Database tables (this engine owns)

> Rule: no other engine queries these tables directly. Other engines listen to this engine's events and keep their own local copies.

- `awareness_scores (id, workspace_id, account_id UNIQUE, current_score, stage, score_7d_change, score_30d_change, last_calculated_at, last_signal_at)`
- `score_snapshots (id, account_id, date, score, dominant_signal_type)`
- `routing_rules (id, workspace_id, name, is_active, trigger_config JSONB, actions TEXT[], priority, cooldown_days, max_per_month)`
- `routing_rule_evaluations (id, rule_id, account_id, matched, fired_at)`
- `stage_change_log (id, account_id, from_stage, to_stage, score, changed_at)`

---

## API endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/v1/awareness/feed` | Hot accounts feed with filters |
| `GET` | `/api/v1/awareness/score/:account_id` | Current score + 30-day history |
| `GET` | `/api/v1/awareness/routing-rules` | List routing rules |
| `POST` | `/api/v1/awareness/routing-rules` | Create routing rule |
| `PUT` | `/api/v1/awareness/routing-rules/:id` | Update routing rule |

---

## User interface

The Dashboard hot accounts feed: accounts ranked by recent signal activity. Each card shows score, stage, 7-day change (green/red arrow), and the top 3 recent signals. The Account Detail screen shows a score trend sparkline (30 days) and the full signal timeline with decay (older signals appear lighter). Settings → Signal routing: rules with enable/disable toggles.

---

## Task completion check

This engine marks its work complete only when ALL of the following are true:

- [ ] Score updated and capped at 100 with decay applied to all prior signals
- [ ] Stage correctly assigned from the score
- [ ] `account.stage_changed` published if a boundary was crossed
- [ ] Routing rules evaluated and matched rules forwarded to the Orchestrator

> If any check fails, the engine publishes an error event instead of a success event. A half-finished job that reports success is worse than a failed job that reports failure.

---

## Failure handling

Score calc error: log full signal history, use last known good score, alert. Daily decay job fails: queue retry — scores are stale but not wrong, safe to retry. Stage changed but account suppressed: publish the event anyway; suppression is handled by the Orchestrator, not here.

---

## How to build it (implementation notes for Claude Code)

1. **Schema first** — create the Prisma models for the tables listed above. Add `workspace_id` to every table and a Supabase RLS policy.
2. **Event consumer** — set up a BullMQ worker subscribing to the trigger event(s). Validate the payload before processing.
3. **Core logic** — implement the step-by-step job above as a service module in `lib/engines/awareness-engine/`.
4. **API routes** — implement the endpoints listed above under `app/api/v1/...`.
5. **Event publisher** — publish the output event only after the task completion check passes.
6. **Tests** — write an integration test that feeds a known input event and asserts the correct output event is published.
7. **Health check** — expose `GET /api/v1/awareness-engine/health` returning {status, version, db_connected, queue_connected, last_event_processed_at}.

