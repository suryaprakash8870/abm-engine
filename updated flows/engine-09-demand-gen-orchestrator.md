# Engine 09 — Demand Gen Orchestrator

> **Execute the right play at the right time**
> Category: Execution · Status: MVP
> Owner: _unassigned_ · Last updated: June 2026

---

## Quick reference

| Field | Value |
|---|---|
| Engine number | 09 |
| Consumes (trigger) | `account.stage_changed`, `account.hot` |
| Publishes (output) | `play.fired`, `play.outcome_recorded` |
| Depends on | Awareness Engine (08) — primary trigger. Contact Engine (06) — needs contacts. Scoring/TAL — needs tier (local copy). |
| Feeds | CRM Sync (10) and GTM Flywheel (11) consume play events. |

---

## What this engine does (plain language)

The Orchestrator is where intelligence becomes action. When the Awareness Engine says a Tier 1 account just hit the Considering stage, the Orchestrator decides exactly what to do, does it, and logs the result — CRM tasks, Slack alerts, AI-drafted emails, sequence enrolments. It is the system's decision-maker and the bridge between data and rep behaviour.

---

## Step-by-step job

1. Receive `account.stage_changed` and `account.hot` events
2. Evaluate the play matrix: tier × stage determines the play template
3. Check suppression rules before firing (snoozed, unsubscribed, cooldown, not-interested)
4. Tier 1: create a context-rich CRM task + Slack notification + AI email draft option
5. Slack notification with interactive buttons (View, Mark contacted, Snooze)
6. AI email draft on demand (Claude Sonnet) referencing the trigger signal and contact role
7. Tier 2/3: enrol contacts in pre-configured sequences (Outreach / Apollo)
8. Log every play in plays_log; record outcomes via `play.outcome_recorded`

---

## LLM model usage

| Task | Model | Why this model |
|---|---|---|
| Personalised email draft | `Claude Sonnet 4.6` | Highest-value LLM use in the system. References the trigger signal, contact role, ICP pain point, prior engagement. 3 subject lines + body. Always rep-reviewed. ~$0.05 per draft. |
| Account narrative summary | `Claude Sonnet 4.6` | 2-3 sentence narrative shown in the Slack alert and CRM task. |
| Play recommendation explanation | `Claude Haiku 4.5` | One-sentence 'why this play' explanation. Simple — Haiku suffices. |

---

## Tools, APIs, and cost

| Tool / API | Purpose | MVP cost |
|---|---|---|
| Slack API | Notifications + interactive messages | Free (Slack app) |
| HubSpot Tasks API (via Engine 10) | Pre-populated CRM tasks | Free (API) |
| Claude Sonnet 4.6 | Email draft + narrative | ~$0.05 per draft |
| Outreach API (v1.1) | Sequence enrolment | Requires Outreach subscription |
| Apollo Sequences API (v1.1) | Alternative sequence enrolment | Included in Apollo Pro |
| Luma API (v2) | Event invites for Tier 1 DMs | Free (API) |

---

## Database tables (this engine owns)

> Rule: no other engine queries these tables directly. Other engines listen to this engine's events and keep their own local copies.

- `plays_log (id, workspace_id, account_id, contact_id, play_type, trigger_type, trigger_signal_id, execution_method, status, crm_task_id, slack_message_ts, assigned_to, outcome, fired_at)`
- `play_templates (id, workspace_id, play_type, tier, stage, template_config JSONB)`
- `play_outcomes (id, play_id, outcome, notes, recorded_at)`
- `suppression_rules (id, workspace_id, rule_type, cooldown_days, max_per_month)`
- `sequence_mappings (id, workspace_id, tier, industry, role, sequence_id)`
- `ai_draft_log (id, play_id, subject_lines TEXT[], body, model_used, generated_at)`

---

## API endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/v1/plays/feed` | Active play queue for current user |
| `POST` | `/api/v1/plays/fire` | Manually trigger a play |
| `PUT` | `/api/v1/plays/:id/outcome` | Log play outcome |
| `POST` | `/api/v1/plays/:id/snooze` | Snooze a play for N days |
| `POST` | `/api/v1/plays/generate-draft` | Generate AI email draft (v1.1) |

---

## User interface

The Dashboard play queue: a list of tasks/plays awaiting the rep, each with play type, account, trigger signal, due date, and an AI context note. Clicking opens the Account Detail panel. The 'Generate email draft' button opens a side panel with 3 subject-line tabs and an editable body. Slack notifications carry the same context with action buttons.

---

## Task completion check

This engine marks its work complete only when ALL of the following are true:

- [ ] Play matrix evaluated and correct play selected
- [ ] Suppression checked BEFORE any external call (atomic check-and-lock)
- [ ] CRM task created and/or Slack notification sent
- [ ] `play.fired` event published and logged

> If any check fails, the engine publishes an error event instead of a success event. A half-finished job that reports success is worse than a failed job that reports failure.

---

## Failure handling

Slack rate limit: queue notification, deliver within 60s. HubSpot task creation fails: retry 3x, then log + alert admin. AI draft fails: surface task without draft, note 'draft unavailable'. Suppression check must be atomic — never fire on a suppressed account.

---

## How to build it (implementation notes for Claude Code)

1. **Schema first** — create the Prisma models for the tables listed above. Add `workspace_id` to every table and a Supabase RLS policy.
2. **Event consumer** — set up a BullMQ worker subscribing to the trigger event(s). Validate the payload before processing.
3. **Core logic** — implement the step-by-step job above as a service module in `lib/engines/demand-gen-orchestrator/`.
4. **API routes** — implement the endpoints listed above under `app/api/v1/...`.
5. **Event publisher** — publish the output event only after the task completion check passes.
6. **Tests** — write an integration test that feeds a known input event and asserts the correct output event is published.
7. **Health check** — expose `GET /api/v1/demand-gen-orchestrator/health` returning {status, version, db_connected, queue_connected, last_event_processed_at}.

