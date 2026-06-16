# Engine 05 — TAL Manager

> **Purpose:** keeper of the official Target Account List — applies suppression, snapshots immutable versions, and pushes the final list to the CRM and ad platforms.

Owner: _unassigned_ · Status: MVP scaffold (stubs)
Full spec: [../../../docs/engines/engine-05-tal-manager.md](../../../docs/engines/engine-05-tal-manager.md)

---

## Events

| Direction | Event | Counterparty |
|---|---|---|
| Consumes (trigger) | `accounts.scored` | Scoring Engine (04) |
| Publishes (output) | `tal.finalized` | Contact Engine (06) + CRM Sync (10) |

The single source of truth for routing is `lib/events/catalog.ts`. `assertMatchesCatalog` (in the test) fails the build if this engine drifts from it.

---

## API endpoints to build

> Implement under `app/api/v1/...`. Enrichment/scoring/sync work is queued, never run in a request.

| Method | Path | Description |
|---|---|---|
| `GET`  | `/api/v1/tal` | Get current TAL with filters |
| `GET`  | `/api/v1/tal/versions` | List TAL versions |
| `POST` | `/api/v1/tal/suppress` | Add account to suppression list |
| `POST` | `/api/v1/tal/finalize` | Finalize and publish the TAL |
| `GET`  | `/api/v1/tal/export` | Export TAL as CSV |
| `GET`  | `/api/v1/tal-manager/health` | Health probe (scaffolded — see `app/api/v1/tal-manager/health/route.ts`) |

---

## DB tables to model

> Defined (commented-out) in `prisma/schema/tal-manager.prisma`. No other engine queries these directly. Every table needs `workspaceId` + a Supabase RLS policy.

- `target_account_lists (id, workspace_id, name, version, account_count, status, created_at)`
- `tal_accounts (id, tal_id, account_id, tier, added_at)` — join table
- `tal_versions (id, tal_id, version_number, snapshot JSONB, created_at)`
- `suppression_list (id, workspace_id, domain, reason, suppressed_until, created_at)`
- `crm_audience_sync_log (id, tal_id, platform, status, synced_at)`

---

## Task-completion checks

The engine publishes `tal.finalized` **only when all of these pass** (encoded verbatim in `validation.ts` `completionCheck`). If any fails, publish an error event instead — never report success on a half-finished job.

- [ ] Suppression rules applied — suppressed accounts removed from active TAL but retained in `suppression_list`
- [ ] A new immutable TAL version created
- [ ] CRM company properties + active lists written (confirmed via Engine 10)
- [ ] `tal.finalized` event published and confirmed

> Note: the catalog defines no dedicated error event for this engine. Per the spec's failure handling, prefer non-blocking degradation (e.g. publish with an `'unreviewed'` review flag when Tier 1 review is incomplete) over failing the pipeline.

---

## Build order (mirrors the doc's "How to build it")

1. **Schema first** — fill in the Prisma models in `prisma/schema/tal-manager.prisma`; add `workspaceId` + RLS to every table.
2. **Event consumer** — `register()` already subscribes `accounts.scored` → `handleAccountsScored`. Keep payload validation first (`validation.ts`).
3. **Core logic** — implement the step-by-step job in `service.ts` (currently stubs):
   - [ ] `loadScoredList`
   - [ ] `applySuppression`
   - [ ] `createTalVersion`
   - [ ] `resolveReviewStatus`
   - [ ] `writeCrmCompanyProperties` (via Engine 10)
   - [ ] `createActiveLists`
   - [ ] `queueLinkedInAudienceSync` (v2)
4. **API routes** — implement the endpoints above under `app/api/v1/...`.
5. **Event publisher** — call `publishTalFinalized` only after `completionCheck().ok` (verify-before-publish, ADR-003).
6. **Tests** — extend `tal-manager.test.ts`: feed `accounts.scored`, assert `tal.finalized` and the gating behaviour.
7. **Health check** — `GET /api/v1/tal-manager/health` is wired to `engine.health()`.

---

## Quickstart

```ts
import { engine } from '@/lib/engines/tal-manager';

engine.register();          // wire BullMQ subscriptions (worker process only)
await engine.health();      // { status, version, db_connected, queue_connected, last_event_processed_at }
```
