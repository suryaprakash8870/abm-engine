# Engine 06 — Contact Engine

> **Source and map buying committees**
> Category: Intelligence · Status: MVP
> Owner: _unassigned_ · Last updated: June 2026

---

## Quick reference

| Field | Value |
|---|---|
| Engine number | 06 |
| Consumes (trigger) | `tal.finalized` event |
| Publishes (output) | `contacts.mapped` |
| Depends on | TAL Manager (05) — needs the finalised tiered list. ICP Engine (01) — needs buyer persona for search criteria. |
| Feeds | Signal Engine (07) and CRM Sync (10) consume `contacts.mapped`. |

---

## What this engine does (plain language)

Selling to a company means selling to 3-7 people. The Contact Engine finds all of them, identifies who is the decision-maker, the champion who'll push the deal, and the influencer who could block it. It verifies emails and pushes contacts to the CRM with roles labelled, so a rep knows whether they're talking to the champion or the blocker.

---

## Step-by-step job

1. Receive `tal.finalized`, process Tier 1 first, then Tier 2 within contact limit
2. Derive stakeholder search criteria from the ICP buyer persona
3. Search Apollo for DM, Champion, Influencer candidates per account (up to 5 per role, 8 for Tier 1)
4. Enrich each contact (name, title, LinkedIn, email, phone, seniority)
5. Verify every email via Apollo verify before CRM upload
6. Assign stakeholder roles via Claude Haiku (confidence > 0.75 auto-assign, below flags for review)
7. Deduplicate against existing CRM contacts by email
8. Push contacts to CRM with abm_stakeholder_role and context properties (via Engine 10)
9. Publish `contacts.mapped` per account with the stakeholder map

---

## LLM model usage

| Task | Model | Why this model |
|---|---|---|
| Stakeholder role assignment | `Claude Haiku 4.5` | Binary classification: DM, champion, or influencer? Batched 20 per call. ~$0.02 per account with a full committee. |
| Contact research for sparse records | `Claude Haiku 4.5` | Infers role/seniority from limited context. Always flagged 'inferred'. |
| Personalised conversation starter | `Claude Sonnet 4.6` | For Tier 1 champions, a one-paragraph note on what this person likely cares about. Generated on demand, not automatically. |

---

## Tools, APIs, and cost

| Tool / API | Purpose | MVP cost |
|---|---|---|
| Apollo People Search API | Find contacts by company + title | Included in Apollo Pro |
| Apollo Email Verifier | Verify email deliverability | ~$0.01 per verification |
| Claude Haiku 4.5 | Role assignment | ~$0.02 per account |
| HubSpot Contacts API (via Engine 10) | Create/update contacts | Free (API) |

---

## Database tables (this engine owns)

> Rule: no other engine queries these tables directly. Other engines listen to this engine's events and keep their own local copies.

- `contacts (id, workspace_id, account_id, crm_contact_id, full_name, title, seniority, department, linkedin_url, email, email_status, stakeholder_role, role_confidence, engagement_score, sourced_at)`
- `stakeholder_maps (id, account_id, dm_contact_ids TEXT[], champion_contact_ids TEXT[], influencer_contact_ids TEXT[])`
- `email_verification_results (id, contact_id, status, bounce_risk, verified_at)`
- `contact_crm_sync_log (id, contact_id, status, synced_at)`
- `sourcing_jobs (id, workspace_id, account_id, status, contacts_found, started_at)`

---

## API endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/v1/contacts/source` | Source contacts for a single account |
| `POST` | `/api/v1/contacts/source-batch` | Source contacts for all Tier 1 accounts |
| `GET` | `/api/v1/contacts/account/:account_id` | Get contacts grouped by role |
| `PUT` | `/api/v1/contacts/:id/role` | Update stakeholder role |
| `POST` | `/api/v1/contacts/manual` | Manually add a contact |

---

## User interface

On the Account Detail screen, a stakeholder map with three columns (Decision Maker, Champion, Influencer). Each contact card shows name, title, LinkedIn link, email-verified tick, and engagement score. Drag contacts between roles. 'Add contact' for manual entries. Click a contact for full detail and engagement history.

---

## Task completion check

This engine marks its work complete only when ALL of the following are true:

- [ ] Each Tier 1 account has at least one verified, role-assigned contact
- [ ] Every contact has a verified email status (valid / risky / invalid)
- [ ] Contacts pushed to CRM with stakeholder role properties (confirmed via Engine 10)
- [ ] `contacts.mapped` event published per account

> If any check fails, the engine publishes an error event instead of a success event. A half-finished job that reports success is worse than a failed job that reports failure.

---

## Failure handling

Apollo returns no contacts: flag account for manual entry. Email verification 'risky': include with warning, never silently drop. Duplicate CRM contact: update existing, don't create a duplicate. Role confidence < 0.5: flag all candidates for manual assignment.

---

## How to build it (implementation notes for Claude Code)

1. **Schema first** — create the Prisma models for the tables listed above. Add `workspace_id` to every table and a Supabase RLS policy.
2. **Event consumer** — set up a BullMQ worker subscribing to the trigger event(s). Validate the payload before processing.
3. **Core logic** — implement the step-by-step job above as a service module in `lib/engines/contact-engine/`.
4. **API routes** — implement the endpoints listed above under `app/api/v1/...`.
5. **Event publisher** — publish the output event only after the task completion check passes.
6. **Tests** — write an integration test that feeds a known input event and asserts the correct output event is published.
7. **Health check** — expose `GET /api/v1/contact-engine/health` returning {status, version, db_connected, queue_connected, last_event_processed_at}.

