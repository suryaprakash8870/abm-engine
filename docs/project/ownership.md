# Ownership & Parallelization Plan

> How a team builds 11 engines **in parallel**, one owner per engine, without stepping on each other.
> Read this with `architecture.md` (the event map) and your engine's doc in `docs/engines/`.

---

## The core idea: contract-first, not order-first

These 11 engines form a pipeline (data flows 01 → 11). It is tempting to think you must **build** them in that order. You don't.

The pipeline order only matters for the **final end-to-end run**. For *development*, every engine is unblocked the moment two things exist:

1. **The foundation** (Phase 0) — auth, multi-tenancy, the event bus, the DB.
2. **The frozen event contracts** — [`lib/events/types.ts`](../../lib/events/types.ts).

Once those exist, all 11 engines can be built **at the same time**, because an engine never calls another engine. It only:

- **consumes** a typed event (which you can fake in a test — you don't need the real upstream engine), and
- **publishes** a typed event (which you verify was emitted — you don't need the real downstream engine).

> **This is the whole reason for the event-driven architecture.** It converts a sequential pipeline into 11 independent work streams. See [ADR-012](decisions.md).

---

## The one true dependency: build the foundation first

```
            ┌──────────────────────────────┐
            │  PHASE 0 — FOUNDATION (shared) │   ← one owner, built FIRST, ~1–2 weeks
            │  auth · workspaces · RLS ·     │
            │  event bus · Prisma · app shell│
            └───────────────┬──────────────┘
                            │ unblocks everyone
   ┌──────┬──────┬──────┬───┴──┬──────┬──────┬──────┬──────┬──────┬──────┐
   ▼      ▼      ▼      ▼      ▼      ▼      ▼      ▼      ▼      ▼      ▼
  01     02     03     04     05     06     07     08     09     10     11
 ICP    TAM   Enrich Score   TAL  Contact Signal Aware  Orch  CRMSync Flywheel
   └──────┴──────┴──────┴──────┴──────┴──────┴──────┴──────┴──────┴──────┘
                  all 11 buildable in parallel against frozen contracts
```

The foundation is **already scaffolded** in this repo (`lib/events/*`, `lib/db/*`, `prisma/schema/schema.prisma`, root config). The foundation owner's job is to make it *real*: wire Supabase auth, RLS policies, Upstash, CI/CD — the Phase 0 checklist in [`todo.md`](todo.md).

---

## Ownership table

Assign one owner per engine (the "you build it, you run it" model). Fill the **Owner** column at your kickoff.

| # | Engine | Owner | Consumes (triggers) | Publishes (outputs) | Hard prereqs for INTEGRATION |
|---|--------|-------|---------------------|---------------------|------------------------------|
| — | **Foundation** | _unassigned_ | — | — | none (build first) |
| 01 | ICP Engine | _unassigned_ | user action · `play.outcome_recorded` · `crm.deal_closed_won/lost` · `icp.refresh_recommended` | `icp.created` · `icp.updated` · `icp.error` | foundation |
| 02 | TAM Builder | _unassigned_ | `icp.created` | `tam.search_completed` · `tam.search_failed` | 01 |
| 03 | Enrichment Engine | _unassigned_ | `tam.search_completed` · `icp.created` | `accounts.enriched` · `enrichment.failed` | 02 |
| 04 | Scoring Engine | _unassigned_ | `accounts.enriched` | `accounts.scored` · `scoring.failed` | 03, 01 |
| 05 | TAL Manager | _unassigned_ | `accounts.scored` | `tal.finalized` | 04, 10 |
| 06 | Contact Engine | _unassigned_ | `tal.finalized` | `contacts.mapped` · `contacts.sourcing_failed` | 05, 10 |
| 07 | Signal Engine | _unassigned_ | website/CRM/email webhooks · `contacts.mapped` | `signal.received` | 06, 05 |
| 08 | Awareness Engine | _unassigned_ | `signal.received` | `account.score_updated` · `account.stage_changed` · `account.hot` | 07 |
| 09 | Demand Gen Orchestrator | _unassigned_ | `account.stage_changed` · `account.hot` | `play.fired` · `play.outcome_recorded` | 08, 06 |
| 10 | CRM Sync Engine | _unassigned_ | CRM-write events from all engines · HubSpot deal webhooks | `crm.synced` · `crm.deal_closed_won/lost` | foundation |
| 11 | GTM Flywheel | _unassigned_ | all events (passive) · `crm.deal_closed_won/lost` | `flywheel.metrics_updated` · `icp.refresh_recommended` · `flywheel.error` | 10 |

The machine-readable version of this table is [`lib/events/catalog.ts`](../../lib/events/catalog.ts) (`EVENT_ROUTES`). Your engine's scaffold validates against it via `assertMatchesCatalog()`.

---

## Suggested build waves (revenue-first)

You *can* build all 11 in parallel. If the team is small, sequence by **business value** — this matches [`plan.md`](plan.md):

- **Wave A (sellable product): 01 → 02+03 → 04+05.** ICP to a tiered list synced to HubSpot. First revenue. Needs 10 (CRM Sync) at least minimally for write-back.
- **Wave B (daily usage): 06 → 07 → 08.** Contacts, live signals, awareness scoring.
- **Wave C (automation + learning): 09 → 10 (hardened) → 11.** Plays, reliable sync, the flywheel.

10 (CRM Sync) is special: a thin version is needed early (Wave A write-back), then hardened in Wave C. Assign it to someone comfortable owning a shared service.

---

## How to build YOUR engine independently (the loop)

Everything you need is in your scaffold: `lib/engines/<your-slug>/`. Steps mirror the "How to build it" section of your engine doc.

1. **Read your doc** in `docs/engines/` end to end. It is the source of truth.
2. **Model your tables.** Edit only **your** file: `prisma/schema/<your-slug>.prisma`. Add `workspaceId` + an RLS policy to every table. Run `npx prisma migrate dev --name "<slug>_init"`. You never touch another engine's schema file (multi-file Prisma = no merge conflicts).
3. **Implement core logic** in `service.ts` (your step-by-step job).
4. **Wire consumers** in `handlers.ts` — already subscribed for you in `index.ts:register()`. Validate the payload first (`validation.ts`).
5. **Publish outputs** in `publisher.ts` — but ONLY after `completionCheck()` passes (verify-before-publish, [ADR-003](decisions.md)). If it fails, publish your error event instead.
6. **Test independently** (see below).
7. **Health check** is wired: `GET /api/v1/<your-slug>/health`.
8. **Check off tasks** in [`todo.md`](todo.md). Record decisions in [`decisions.md`](decisions.md).

### Developing without the upstream engine — the test harness

You do **not** wait for the engine before you. Fake its output event and run your handler:

```ts
import { describe, it, expect } from 'vitest';
import { fakeEvent, withCapturedEvents } from '@/lib/events';
import { handleAccountsEnriched } from './handlers'; // your handler

it('scores accounts and publishes accounts.scored', async () => {
  const published = await withCapturedEvents(async () => {
    await handleAccountsEnriched(
      fakeEvent('accounts.enriched', {
        job_id: 'job_1', source_job_id: 'tam_1',
        enriched_account_ids: ['acc_1'], total: 1, enriched: 1, failed: 0,
        qualified_count: 1, disqualified_count: 0,
        quality_summary: {}, top_industries: [], geography_breakdown: {},
      }),
    );
  });
  expect(published.map((e) => e.type)).toContain('accounts.scored');
});
```

Because the contract is frozen, the fake event you build is exactly what the real upstream engine will emit. When both engines are done, they connect with zero glue code.

---

## Definition of Done (per engine)

An engine is "done" when **all** of these are true (this is your PR checklist):

- [ ] All owned tables modelled in `prisma/schema/<slug>.prisma` with `workspaceId` + RLS, migration applied.
- [ ] Every consumed event has a validated handler.
- [ ] Output event(s) published **only** after `completionCheck()` passes; error event published on failure.
- [ ] The integration test passes: known input event → correct output event (`npm run test`).
- [ ] `assertMatchesCatalog(engine)` passes (you didn't drift from the contract).
- [ ] `GET /api/v1/<slug>/health` returns `{ db_connected, queue_connected, ... }`.
- [ ] All API endpoints from your doc implemented under `app/api/v1/...`.
- [ ] `npm run check` (typecheck + lint + test) is green.

---

## The rules you may NOT break (or you break everyone else)

1. **Never query another engine's tables.** Need their data? Subscribe to their event and keep a local copy. ([ADR-010](decisions.md))
2. **Never call another engine directly.** Publish/subscribe only.
3. **Never change a frozen event payload alone.** Removing/renaming a field in `lib/events/types.ts` is a breaking change — it needs sign-off from every consuming owner (see the catalog's `consumedBy`). Adding an optional field is fine.
4. **All CRM writes go through Engine 10.** Don't call HubSpot from your engine. ([ADR-005](decisions.md))
5. **Verify before publishing.** A half-finished job that reports success corrupts everyone downstream. ([ADR-003](decisions.md))
6. **Every table has `workspace_id` + RLS.** No exceptions except the shared `enrichment_cache`.

---

## Changing the contract (the only cross-team coordination point)

The event contracts are the team's shared API. To change one:

1. Open a PR editing `lib/events/types.ts` **and** `lib/events/catalog.ts` (+ `architecture.md`).
2. Tag every owner whose engine appears in that event's `publishedBy`/`consumedBy`.
3. Additive change (new optional field) → fast approve. Breaking change (rename/remove/retype) → all affected owners must approve, and bump the note in the file header.

This is the **only** place engines must coordinate. Everything else is independent.

---

## Cadence & git

- **Branches:** `feature/<engine>-<desc>`, e.g. `feature/scoring-formula-editor`. Every PR references a task in `todo.md`.
- **Weekly:** Mon plan, Wed check-in (any contract changes needed?), Fri demo + update `todo.md`/`plan.md`.
- **Integration checkpoint:** after each wave, run the partial end-to-end (`fakeEvent` at the head of the wave, assert the tail event). Fix contract mismatches here, not inside engines.
- **Final:** the full ICP → … → flywheel end-to-end test (see `plan.md`, "After Phase 9").

---

## Where everything lives

| You need… | Look at |
|---|---|
| The event contracts (the shared API) | `lib/events/types.ts` |
| Who publishes/consumes what | `lib/events/catalog.ts` · `architecture.md` |
| Your engine's spec | `docs/engines/engine-NN-<slug>.md` |
| Your engine's scaffold | `lib/engines/<slug>/` + its `README.md` |
| The table-ownership map | `schema.md` |
| Build order & phases | `plan.md` · `todo.md` |
| Why a decision was made | `decisions.md` |
| Porting logic from the v0 prototype | `migration.md` |
