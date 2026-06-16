# Engine 08 — Awareness Engine

> **One-line purpose:** turn raw buying signals into a single, explainable awareness score per account — apply per-signal time-decay, manage the five awareness stages, detect "hot" jumps, and evaluate the routing rules that tell reps when to act.

Owner: _unassigned_ · Category: Intelligence · Status: MVP
Full spec: [../../../docs/engines/engine-08-awareness-engine.md](../../../docs/engines/engine-08-awareness-engine.md)

Scoring + routing are **deterministic (no LLM)** so a rep asking "why is this account at 67?" gets an auditable signal-history answer. (An on-demand `Claude Sonnet 4.6` account narrative is a separate, non-loop feature.)

---

## Consumes / Publishes

| Direction | Event | Notes |
|---|---|---|
| Consumes | `signal.received` | A scored signal from the Signal Engine (07). Triggers a full recompute. |
| Publishes | `account.score_updated` | The recomputed, decayed, capped (≤100) score + stage. Always emitted. → CRM Sync (10) + GTM Flywheel (11). |
| Publishes | `account.stage_changed` | Only when the new score crosses a stage boundary. → Demand-Gen Orchestrator (09). |
| Publishes | `account.hot` | Only when the score jumps > 20 points within 48 hours. → Orchestrator (09) + GTM Flywheel (11). |

> `register()` wires the single consumed event (`signal.received`). The **daily decay recalculation** (00:00 UTC) runs as a BullMQ scheduled job, and routing-rule CRUD + the score feed are HTTP routes — neither is wired in `register()`.

---

## API endpoints to build

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/v1/awareness/feed` | Hot accounts feed with filters |
| `GET` | `/api/v1/awareness/score/:account_id` | Current score + 30-day history |
| `GET` | `/api/v1/awareness/routing-rules` | List routing rules |
| `POST` | `/api/v1/awareness/routing-rules` | Create routing rule |
| `PUT` | `/api/v1/awareness/routing-rules/:id` | Update routing rule |
| `GET` | `/api/v1/awareness-engine/health` | Health probe (already scaffolded) |

---

## DB tables to model

Defined (commented) in [`../../../prisma/schema/awareness-engine.prisma`](../../../prisma/schema/awareness-engine.prisma). Add `workspaceId` + a Supabase RLS policy to every table. No other engine queries these directly — they listen to this engine's events and keep local copies.

- `awareness_scores` — `(id, workspace_id, account_id UNIQUE, current_score, stage, score_7d_change, score_30d_change, last_calculated_at, last_signal_at)`
- `score_snapshots` — `(id, account_id, date, score, dominant_signal_type)`
- `routing_rules` — `(id, workspace_id, name, is_active, trigger_config JSONB, actions TEXT[], priority, cooldown_days, max_per_month)`
- `routing_rule_evaluations` — `(id, rule_id, account_id, matched, fired_at)`
- `stage_change_log` — `(id, account_id, from_stage, to_stage, score, changed_at)`

---

## Task completion checks (verify before publishing success events)

Encoded in [`validation.ts`](./validation.ts) → `completionCheck()`. Publish the success events only when ALL are true; otherwise publish the engine's error path. A half-finished job that reports success is worse than a failed job that reports failure.

- [ ] Score updated and capped at 100 with decay applied to all prior signals
- [ ] Stage correctly assigned from the score
- [ ] `account.stage_changed` published if a boundary was crossed
- [ ] Routing rules evaluated and matched rules forwarded to the Orchestrator

---

## Build order (mirrors the doc's "How to build it")

- [ ] **Schema first** — fill in the Prisma models in `prisma/schema/awareness-engine.prisma`; add `workspaceId` + RLS to each.
- [ ] **Event consumer** — `register()` in `index.ts` already subscribes `signal.received`; flesh out `handlers.ts`.
- [ ] **Core logic** — implement the step-by-step job in `service.ts` (decayed recompute + cap 100, `stageForScore`, hot detection > 20pts/48h, routing-rule evaluation, daily decay job, daily snapshots).
- [ ] **API routes** — implement the feed, score, and routing-rule endpoints under `app/api/v1/awareness/...`.
- [ ] **Event publisher** — call the `publisher.ts` helpers only after `completionCheck()` passes (ADR-003).
- [ ] **Tests** — extend `awareness-engine.test.ts`: assert the real decayed/capped score, conditional `account.stage_changed`, and `account.hot` on a > 20pt/48h jump.
- [ ] **Health check** — `GET /api/v1/awareness-engine/health` is scaffolded; surface `last_event_processed_at` from `awareness_scores.last_calculated_at`.

---

## Failure handling (from the doc)

- Score calc error → log the full signal history, fall back to the last known good score, alert.
- Daily decay job fails → queue retry (scores are stale but not wrong, safe to retry).
- Stage changed but account suppressed → publish the event anyway; suppression is the Orchestrator's job, not this engine's.
