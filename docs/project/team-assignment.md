# Team Assignment — 11 engines, 4 members

> The concrete instantiation of [`ownership.md`](ownership.md) for a 4-person team
> (3 members own 3 engines each, 1 member owns 2). Owners are assigned below.
>
> The split maps each member to a **contiguous segment of the pipeline**, so most
> engine-to-engine boundaries stay *inside* one person's ownership and the
> cross-member handoffs are few and clean.

## Who owns what

```
  THE PIPELINE                          OWNER          HANDOFF TO NEXT MEMBER (the seam)
┌───────────────────────────────┐
│ 01 ICP ─ 02 TAM ─ 03 Enrich    │  Member A (3)   ── accounts.enriched ─▶
├───────────────────────────────┤
│ 04 Scoring ─ 05 TAL            │  Member B (2)   ── tal.finalized ─▶
├───────────────────────────────┤
│ 06 Contact ─ 07 Signal ─ 08 Aw │  Member C (3)   ── account.stage_changed / .hot ─▶
├───────────────────────────────┤
│ 09 Orchestrator ─ 10 CRMSync   │  Member D (3)   ── crm.deal_closed_won/lost ──┐
│ ─ 11 Flywheel                  │                    icp.refresh_recommended ───┘ back to A
└───────────────────────────────┘                    (the flywheel closes)
```

| Member | Name | Engines | Theme | Why grouped |
|--------|------|---------|-------|-------------|
| **A** | **Surya** | 01 ICP · 02 TAM · 03 Enrichment | Targeting & data pipeline | TAM + Enrichment are tightly coupled (built together in `plan.md`); all three are "front of funnel." Heavy on Apollo/Claude. |
| **B** | **Nethaji** | 04 Scoring · 05 TAL | Scoring & list (revenue) | The pair that produces the first sellable output. Lighter on engine count → this member also owns **Stripe billing** (lands in Phase 3 here). |
| **C** | **Anto** | 06 Contact · 07 Signal · 08 Awareness | Engagement intelligence | Contacts → signals → awareness is one cohesive loop (`signal.received` stays *within* C). |
| **D** | **Vicky** | 09 Orchestrator · 10 CRM Sync · 11 Flywheel | Execution, sync & learning | Owns the two cross-cutting engines (CRM Sync writes for *everyone*; Flywheel listens to *everyone*) + the Orchestrator. Give to the strongest/most senior dev — D is the **integration owner**. |

> Swap engines based on individual strengths, but keep each person on a **contiguous
> band** — that is what minimizes coordination.

## The mental model: build in parallel, integrate in sequence

Members do **not** take turns. From week 2, all four build at once — because the
event contracts in [`lib/events/types.ts`](../../lib/events/types.ts) are frozen, each
person mocks their upstream input and asserts their output in isolation (the
`fakeEvent` / `withCapturedEvents` harness). Pipeline order governs *when engines
connect*, not *when people work*.

1. **Week 1 — Foundation sprint (all hands).** The foundation is scaffolded but not
   "real" yet. **Vicky (Member D) leads** wiring Supabase auth + RLS, Upstash
   `REDIS_URL`, CI/CD, and the app shell — the Phase 0 checklist in [`todo.md`](todo.md).
   Surya, Nethaji and Anto contribute and, in parallel, model their first engine's
   Prisma tables and write
   their integration tests against the frozen contracts.
2. **Week 2 onward — parallel ownership.** Each member builds their band using the
   per-engine loop in [`ownership.md`](ownership.md), mocking cross-member inputs.
3. **Integration milestones** at the seams (below): swap mocks for real events, run a
   partial end-to-end.

## The only 4 things members coordinate on (the seams)

Everything else is independent. Agree on these cross-member event contracts once; then
they are frozen.

| Seam | Event(s) | Producer → Consumer |
|------|----------|---------------------|
| 1 | `accounts.enriched` (+ `icp.created`, which Scoring also consumes) | **Surya (A) → Nethaji (B)** |
| 2 | `tal.finalized` | **Nethaji (B) → Anto (C)** *and* **→ Vicky (D)** |
| 3 | `account.stage_changed`, `account.hot` | **Anto (C) → Vicky (D)** |
| 4 | `crm.deal_closed_won/lost`, `icp.refresh_recommended` | **Vicky (D) → Surya (A)** (closes the flywheel) |

A new field on a shared event = a PR to `lib/events/types.ts` tagging the affected
owners (see the contract-change rule in [`ownership.md`](ownership.md)).

## Build order (revenue-first)

Even working in parallel, prioritise the path to a sellable product:

1. **Milestone 1 — "ICP → tiered list in HubSpot" (Phases 1–3).** Surya builds 01→03,
   Nethaji builds 04→05, and **Vicky builds a thin CRM Sync (10) early** — out of its
   normal order — because Nethaji's TAL write-back needs it. This is the one dependency
   that jumps the sequence; flag it on day one.
2. **Milestone 2 — "live signals → daily usage" (Phases 4–6).** Anto's whole band.
3. **Milestone 3 — "automation + learning" (Phases 7–9).** Vicky hardens CRM Sync, then
   builds the Orchestrator and Flywheel.

## Working rhythm

- **Git:** each person works only in `lib/engines/<their-slug>/`, their own
  `prisma/schema/<slug>.prisma`, and their `app/api/v1/<slug>/` routes. Disjoint
  folders → near-zero merge conflicts. Branches: `feature/<engine>-<desc>`.
- **Definition of Done** per engine = the checklist in [`ownership.md`](ownership.md)
  (models + RLS, handlers, verify-before-publish, integration test, health endpoint,
  `npm run check` green).
- **Cadence:** Mon plan · **Wed contract check** (any shared-event changes this week?)
  · Fri demo + tick off [`todo.md`](todo.md). Run the partial end-to-end at each seam
  after a milestone.
- **Reuse the v0 prototype:** A / B / D can port real logic (Apollo, scoring rubric,
  HubSpot adapter + token crypto) from `apps/` — see [`migration.md`](migration.md).
