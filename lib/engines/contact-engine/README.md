# Engine 06 — Contact Engine

> **Purpose:** source and map buying committees — find the decision-maker, champion, and influencer for each Tier-1/2 account, verify emails, assign stakeholder roles, dedupe against the CRM, and publish a per-account stakeholder map.

Owner: _unassigned_ · Status: MVP scaffold (stubs)
Full spec: [../../../docs/engines/engine-06-contact-engine.md](../../../docs/engines/engine-06-contact-engine.md)

---

## Events

| Direction | Event | Counterparty |
|---|---|---|
| Consumes (trigger) | `tal.finalized` | TAL Manager (05) |
| Publishes (output) | `contacts.mapped` | Signal Engine (07) + CRM Sync (10) |
| Publishes (error) | `contacts.sourcing_failed` | Terminal — ops/observability (flag for manual entry) |

The single source of truth for routing is `lib/events/catalog.ts`. `assertMatchesCatalog` (in the test) fails the build if this engine drifts from it.

---

## API endpoints to build

> Implement under `app/api/v1/...`. Sourcing/enrichment/verification/sync work is queued (BullMQ), never run inside a web request.

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/v1/contacts/source` | Source contacts for a single account |
| `POST` | `/api/v1/contacts/source-batch` | Source contacts for all Tier 1 accounts |
| `GET`  | `/api/v1/contacts/account/:account_id` | Get contacts grouped by role |
| `PUT`  | `/api/v1/contacts/:id/role` | Update stakeholder role |
| `POST` | `/api/v1/contacts/manual` | Manually add a contact |
| `GET`  | `/api/v1/contact-engine/health` | Health probe (scaffolded — see `app/api/v1/contact-engine/health/route.ts`) |

---

## DB tables to model

> Defined (commented-out) in `prisma/schema/contact-engine.prisma`. No other engine queries these directly. Every table needs `workspaceId` + a Supabase RLS policy.

- `contacts (id, workspace_id, account_id, crm_contact_id, full_name, title, seniority, department, linkedin_url, email, email_status, stakeholder_role, role_confidence, engagement_score, sourced_at)`
- `stakeholder_maps (id, account_id, dm_contact_ids TEXT[], champion_contact_ids TEXT[], influencer_contact_ids TEXT[])`
- `email_verification_results (id, contact_id, status, bounce_risk, verified_at)`
- `contact_crm_sync_log (id, contact_id, status, synced_at)`
- `sourcing_jobs (id, workspace_id, account_id, status, contacts_found, started_at)`

---

## Task-completion checks

The engine publishes `contacts.mapped` **only when all of these pass** (encoded verbatim in `validation.ts` `completionCheck`). If any fails, it publishes `contacts.sourcing_failed` instead — never report success on a half-finished job (verify-before-publish, ADR-003).

- [ ] Each Tier 1 account has at least one verified, role-assigned contact
- [ ] Every contact has a verified email status (valid / risky / invalid)
- [ ] Contacts pushed to CRM with stakeholder role properties (confirmed via Engine 10)
- [ ] `contacts.mapped` event published per account

> Failure handling: Apollo returns no contacts → flag account for manual entry. Email verification 'risky' → include with warning, never silently drop. Duplicate CRM contact → update existing, don't create a duplicate. Role confidence < 0.5 → flag all candidates for manual assignment.

---

## Build order (mirrors the doc's "How to build it")

1. **Schema first** — fill in the Prisma models in `prisma/schema/contact-engine.prisma`; add `workspaceId` + RLS to every table.
2. **Event consumer** — `register()` already subscribes `tal.finalized` → `handleTalFinalized`. Keep payload validation first (`validation.ts`).
3. **Core logic** — implement the step-by-step job in `service.ts` (currently stubs), per account, Tier 1 first:
   - [ ] `loadAccountsToProcess`
   - [ ] `startSourcingJob`
   - [ ] `deriveSearchCriteria`
   - [ ] `searchCandidates` (Apollo; no contacts → `contacts.sourcing_failed`)
   - [ ] `enrichContacts`
   - [ ] `verifyEmails` ('risky' kept with warning)
   - [ ] `assignStakeholderRoles` (Claude Haiku 4.5, confidence > 0.75 auto-assign)
   - [ ] `deduplicateAgainstCrm`
   - [ ] `pushContactsToCrm` (via Engine 10; await ack)
   - [ ] `buildStakeholderMap`
4. **API routes** — implement the endpoints above under `app/api/v1/...`.
5. **Event publisher** — call `publishContactsMapped` only after `completionCheck().ok` (verify-before-publish, ADR-003); otherwise `publishContactsSourcingFailed`.
6. **Tests** — extend `contact-engine.test.ts`: feed `tal.finalized`, assert `contacts.mapped` and the gating/error behaviour.
7. **Health check** — `GET /api/v1/contact-engine/health` is wired to `engine.health()`.

---

## Quickstart

```ts
import { engine } from '@/lib/engines/contact-engine';

engine.register();          // wire BullMQ subscriptions (worker process only)
await engine.health();      // { status, version, db_connected, queue_connected, last_event_processed_at }
```
