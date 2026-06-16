# Engine 01 — ICP Engine

> **Build the Ideal Customer Profile**
> Category: Foundation · Status: MVP
> Owner: _unassigned_ · Last updated: June 2026

---

## Quick reference

| Field | Value |
|---|---|
| Engine number | 01 |
| Consumes (trigger) | User action (wizard / CRM connect / CSV upload) |
| Publishes (output) | `icp.created`, `icp.updated` |
| Depends on | None — this is the first engine. Triggered only by direct user action. |
| Feeds | TAM Builder (02) and Scoring Engine (04) both consume `icp.created`. |

---

## What this engine does (plain language)

The ICP Engine answers one question: who should we be selling to? It takes whatever data the user has — nothing at all, or years of CRM history — and produces a structured definition of the ideal customer that every downstream engine uses as its primary instruction set.

---

## Step-by-step job

1. Route the user to the right ICP mode based on three onboarding questions (Has CRM? Has deals? Main goal?)
2. Mode A (Hypothesis): run a 12-question AI wizard, synthesise answers into a structured ICP via Claude Sonnet
3. Mode B (CRM Analysis): pull closed-won/lost deals via OAuth, run statistical comparison, interpret with Claude Sonnet
4. Mode C (CSV Import): upload CRM export, map fields, run the same analysis pipeline as Mode B
5. Produce an identical structured ICP object in all modes (firmographics, technographics, signals, exclusions)
6. Version the ICP and publish `icp.created` to the event bus
7. Re-publish `icp.updated` whenever the ICP changes (manual edit or GTM Flywheel feedback)

---

## LLM model usage

| Task | Model | Why this model |
|---|---|---|
| ICP synthesis from wizard answers | `Claude Sonnet 4.6` | Reasoning-heavy. Extracts intent, fills gaps, generates structured output with confidence per field. The foundation of the whole system — worth the Sonnet cost. |
| CRM statistical interpretation | `Claude Sonnet 4.6` | Turns quantitative win/loss patterns into a qualitative ICP narrative. Needs nuanced reasoning about signal vs noise. |
| AE interview question generation | `Claude Haiku 4.5` | Template-filling from ICP gaps. Simple — Haiku is fast and cheap enough. |

---

## Tools, APIs, and cost

| Tool / API | Purpose | MVP cost |
|---|---|---|
| Anthropic Claude API | ICP synthesis + interpretation | ~$0.05 per ICP build |
| HubSpot OAuth | Pull deal data for Mode B | Free (OAuth app) |
| Salesforce OAuth (v1.1) | Pull deal data for Mode B | Free (Connected App) |
| Papa Parse (CSV) | Parse CRM exports in browser | Free (open source) |
| Zapier App (v1.1) | Real-time deal sync from any CRM | Free to build |

---

## Database tables (this engine owns)

> Rule: no other engine queries these tables directly. Other engines listen to this engine's events and keep their own local copies.

- `icp_definitions (id, workspace_id, version, mode, firmographics JSONB, technographics JSONB, signals JSONB, exclusions JSONB, confidence_score, created_at)`
- `icp_versions (id, icp_id, version_number, snapshot JSONB, created_at)`
- `wizard_sessions (id, workspace_id, answers JSONB, completed_at)`
- `crm_analysis_jobs (id, workspace_id, crm_type, status, deal_count, result JSONB)`
- `icp_confidence_history (id, icp_id, confidence_score, recorded_at)`

---

## API endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/v1/icp/wizard` | Submit wizard answers, return ICP draft |
| `POST` | `/api/v1/icp/crm-analysis` | Trigger CRM-analysis ICP generation (async) |
| `POST` | `/api/v1/icp/csv-import` | Upload CSV, start field mapping |
| `GET` | `/api/v1/icp/:id` | Fetch an ICP definition |
| `PUT` | `/api/v1/icp/:id` | Update ICP fields (creates new version) |
| `GET` | `/api/v1/icp/templates` | List industry benchmark templates |

---

## User interface

Onboarding flow with three button-choice questions. Wizard is one question per screen with a progress bar and helper text. The generated ICP displays as a structured card — each criterion with a coloured confidence bar (green=high, amber=medium, red=hypothesis) and AI reasoning on hover. Every field is editable. Primary button: 'Save ICP and build my account list'.

---

## Task completion check

This engine marks its work complete only when ALL of the following are true:

- [ ] ICP object passes schema validation against the ICPDefinition TypeScript interface
- [ ] confidence_score field is populated for the ICP and every criterion
- [ ] `icp.created` event is published AND confirmed received by a test consumer
- [ ] UI shows 'ICP complete' only after all three above are true

> If any check fails, the engine publishes an error event instead of a success event. A half-finished job that reports success is worse than a failed job that reports failure.

---

## Failure handling

If Claude API is down: save wizard answers, queue synthesis for retry, show 'Generating your ICP — we'll notify you'. Never block the user on AI latency. If CRM analysis has <5 deals: route to Mode A with a confidence warning. If HubSpot OAuth fails: fall back to CSV import.

---

## How to build it (implementation notes for Claude Code)

1. **Schema first** — create the Prisma models for the tables listed above. Add `workspace_id` to every table and a Supabase RLS policy.
2. **Event consumer** — set up a BullMQ worker subscribing to the trigger event(s). Validate the payload before processing.
3. **Core logic** — implement the step-by-step job above as a service module in `lib/engines/icp-engine/`.
4. **API routes** — implement the endpoints listed above under `app/api/v1/...`.
5. **Event publisher** — publish the output event only after the task completion check passes.
6. **Tests** — write an integration test that feeds a known input event and asserts the correct output event is published.
7. **Health check** — expose `GET /api/v1/icp-engine/health` returning {status, version, db_connected, queue_connected, last_event_processed_at}.

