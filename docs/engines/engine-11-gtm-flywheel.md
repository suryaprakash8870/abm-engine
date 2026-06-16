# Engine 11 — GTM Flywheel

> **Attribution, insights, and ICP feedback**
> Category: Intelligence · Status: MVP
> Owner: _unassigned_ · Last updated: June 2026

---

## Quick reference

| Field | Value |
|---|---|
| Engine number | 11 |
| Consumes (trigger) | Events from all 10 engines |
| Publishes (output) | `flywheel.metrics_updated`, `icp.refresh_recommended` |
| Depends on | All engines (passive listener). Especially CRM Sync (10) for deal outcomes. |
| Feeds | ICP Engine (01) consumes `icp.refresh_recommended` — closing the learning loop. |

---

## What this engine does (plain language)

The GTM Flywheel makes the whole system smarter over time. It watches every signal, play, win, and loss across all ten engines and extracts insight: which signals predicted pipeline, which attributes correlate with fast deals, whether Tier 1 actually converts better. When a deal closes, it feeds the outcome back to the ICP Engine. This is what turns a one-time tool into a learning system.

---

## Step-by-step job

1. Passively consume events from all engines (never blocks any engine)
2. On `crm.deal_closed_won`: walk back the account's signal history to build attribution
3. Continuously calculate pipeline, win rate, avg deal size, days-to-close — by tier
4. After 20+ closed deals: run signal correlation analysis
5. After every 5th new Closed Won: publish `icp.refresh_recommended`
6. On `crm.deal_closed_lost`: update the anti-ICP model and surface exclusion suggestions
7. Generate and send a weekly metrics digest email every Monday
8. Publish `flywheel.metrics_updated` daily or on significant change

---

## LLM model usage

| Task | Model | Why this model |
|---|---|---|
| ICP refresh analysis | `Claude Sonnet 4.6` | Analyses new closed-won deals against the existing ICP, generates an updated ICP with an explanation of what changed. Reuses the Engine 01 Mode B pipeline. ~$0.50 per refresh. |
| Weekly digest narrative | `Claude Haiku 4.5` | Turns raw metrics into a readable email summary. Low complexity — Haiku ideal. |
| Signal correlation interpretation | `Claude Sonnet 4.6` | Explains statistical correlation results in plain language for non-technical users, with a recommended action. |
| ICP improvement suggestions | `Claude Sonnet 4.6` | Analyses lost-deal patterns to generate specific, actionable exclusion/refinement suggestions as approve/dismiss UI cards. |

---

## Tools, APIs, and cost

| Tool / API | Purpose | MVP cost |
|---|---|---|
| PostgreSQL analytics | Correlation, win rate, attribution | Free (own DB) |
| Claude Sonnet 4.6 | ICP analysis, interpretation, suggestions | ~$0.50 per ICP refresh |
| Resend | Weekly digest email | Free up to 3,000/month |

---

## Database tables (this engine owns)

> Rule: no other engine queries these tables directly. Other engines listen to this engine's events and keep their own local copies.

- `pipeline_snapshots (id, workspace_id, date, pipeline_by_tier JSONB, win_rate_by_tier JSONB, avg_deal_size_by_tier JSONB)`
- `attribution_events (id, workspace_id, account_id, deal_id, touch_type, signal_id, occurred_before_pipeline, recorded_at)`
- `win_loss_analysis (id, workspace_id, deal_id, outcome, account_attributes JSONB, analyzed_at)`
- `flywheel_metrics (id, workspace_id, metric_key, value, period, calculated_at)`
- `signal_correlation_data (id, workspace_id, signal_combination TEXT[], correlation_score, sample_size, calculated_at)`

---

## API endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/v1/flywheel/pipeline` | Pipeline by tier dashboard data |
| `GET` | `/api/v1/flywheel/attribution` | Multi-touch attribution data |
| `GET` | `/api/v1/flywheel/correlation` | Signal correlation analysis |
| `GET` | `/api/v1/flywheel/metrics` | All flywheel metrics |

---

## User interface

A Reporting/Insights screen: pipeline-by-tier chart, win rate by tier, average deal size by tier, days-to-close by tier. A signal correlation panel ('accounts that visit pricing AND reply to email convert 3x more — consider increasing the email-reply weight'). ICP improvement suggestion cards with approve/dismiss. The weekly digest arrives by email.

---

## Task completion check

This engine marks its work complete only when ALL of the following are true:

- [ ] Attribution built for every closed deal (signal timeline walked back)
- [ ] Pipeline/win-rate metrics calculated by tier
- [ ] Correlation analysis suppressed below 20 data points (no misleading stats)
- [ ] `flywheel.metrics_updated` published; `icp.refresh_recommended` fired after every 5th win

> If any check fails, the engine publishes an error event instead of a success event. A half-finished job that reports success is worse than a failed job that reports failure.

---

## Failure handling

Missing historical events on first deploy: backfill from CRM history via a one-time import. Attribution ambiguity: present first-touch, last-touch, and linear models, not one 'true' number. Correlation with <20 data points: show 'more data needed', never misleading statistics.

---

## How to build it (implementation notes for Claude Code)

1. **Schema first** — create the Prisma models for the tables listed above. Add `workspace_id` to every table and a Supabase RLS policy.
2. **Event consumer** — set up a BullMQ worker subscribing to the trigger event(s). Validate the payload before processing.
3. **Core logic** — implement the step-by-step job above as a service module in `lib/engines/gtm-flywheel/`.
4. **API routes** — implement the endpoints listed above under `app/api/v1/...`.
5. **Event publisher** — publish the output event only after the task completion check passes.
6. **Tests** — write an integration test that feeds a known input event and asserts the correct output event is published.
7. **Health check** — expose `GET /api/v1/gtm-flywheel/health` returning {status, version, db_connected, queue_connected, last_event_processed_at}.

