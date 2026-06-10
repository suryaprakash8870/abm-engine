---
name: abm-engine-builder
description: Use when building, extending, or debugging any part of the ABM Engine SaaS — the CRM-agnostic intelligence layer (Enrichment, Scoring, Signal Scorer, Orchestrator, CRM Adapter) built on Next.js + NestJS + Supabase. Triggers on tasks involving account scoring, ICP models, signal tracking, awareness scoring, CRM integration/write-back, enrichment pipelines, or the ABM dashboard.
---

# ABM Engine Builder

A workflow for building and extending the OneGTMLab ABM Engine — a CRM-agnostic ABM intelligence layer. Follow this when implementing any of the 5 core components or wiring them together.

## When to use this skill

- Implementing or changing Enrichment, Scoring, Signal Scorer, Orchestrator, or CRM Adapter
- Adding a new CRM (e.g. Salesforce after HubSpot)
- Adding a new signal source or enrichment provider
- Building the dashboard or CRM write-back
- Debugging scoring/awareness logic

## Before writing any code

1. **Read `CLAUDE.md`** for stack, hard rules, and conventions.
2. **Check `DECISIONS.md`** — the answer to "which X should I use" is often already decided.
3. **Identify which of the 5 components** the task touches and respect its interface boundary.
4. **Confirm the phase** in `TODO.md` — don't build Phase 3 work if Phase 2's validation gate hasn't passed.

## The 5-component architecture (respect the boundaries)

```
Customer CRM <--> [CRM Adapter] --> [Enrichment] --> [Scoring] --> [Signal Scorer] --> [Orchestrator] --> back to CRM + Dashboard
```

- Each is a separate NestJS module with a clean interface.
- Only the **CRM Adapter** talks to HubSpot/Salesforce. Nothing else imports CRM SDKs.
- Data flows one direction through the pipeline; the Orchestrator writes back via the Adapter.

## Component build checklist

### CRM Adapter (build first — everything plugs into it)
- [ ] Define a single `CrmAdapter` interface: `getAccounts`, `getContacts`, `upsertAccount`, `upsertContact`, `createTask`.
- [ ] Implement `HubspotAdapter` behind it. (Salesforce later = new class, same interface.)
- [ ] Handle OAuth token refresh and rate limits inside the adapter.
- [ ] **Upsert, not overwrite:** match on email/phone; add fields, never delete existing data.
- [ ] Encrypt stored tokens; never log them.

### Enrichment
- [ ] Wrap the provider (Apollo/Clearbit) in a rate-limited, cached (Redis) client.
- [ ] Run as a **BullMQ background job**, never in a web request.
- [ ] Output normalized firmographics + technographics regardless of provider.
- [ ] Make jobs idempotent (safe to retry).

### Scoring
- [ ] ICP rubric = explicit fields + weights, stored as config (not hardcoded).
- [ ] Output a fit score and a tier (1/2/3).
- [ ] Derive the rubric from real win/loss data, not guesses.

### Signal Scorer (the key differentiator)
- [ ] Ingest 1st / 2nd / 3rd-party signals into a normalized signal event table.
- [ ] **Weight signals** — 1st-party (pricing-page visit, product usage) ≫ 3rd-party (generic intent).
- [ ] **Time-decay** old signals.
- [ ] Output a single rolling signal score per account.

### Awareness Score
- [ ] Map combined fit + signal scores to the 5-stage funnel: Identified → Aware → Interested → Considering → Selecting.
- [ ] Define explicit transition thresholds.
- [ ] **VALIDATION GATE:** confirm the stage predicts closed-won rate before building activation on top of it.

### Orchestrator (rules engine)
- [ ] Rules as config: `if score > X AND signal = Y → action Z`.
- [ ] Actions delivered via APIs (Slack, CRM task via Adapter, email trigger via Smartlead).
- [ ] Log every trigger for auditability.

### Dashboard
- [ ] Next.js + Tremor; consume backend via TanStack Query.
- [ ] Build only after the engine produces validated scores.

## Standard task flow

1. State which component + phase the task belongs to.
2. Confirm it doesn't violate a hard rule in `CLAUDE.md`.
3. Write/extend the component behind its interface.
4. If it touches external APIs → ensure it's queued, cached, rate-limited.
5. If multi-tenant data → ensure `org_id` + RLS.
6. Update `TODO.md` (check off) and `DECISIONS.md` (if a new choice was made).

## Anti-patterns to refuse

- Building a CRM, a data/enrichment company, or an email-sending engine.
- Synchronous enrichment in a request handler.
- Direct CRM SDK calls outside the Adapter.
- Equal-weight signals; no time-decay.
- Shipping a dashboard on an unvalidated score.
- Plain-text secrets.

## After completing a task

- Update `TODO.md` checkboxes.
- If a decision was made or changed, append to `DECISIONS.md` with date + rationale.
- Note any vendor pricing/limit that should be re-verified live.
