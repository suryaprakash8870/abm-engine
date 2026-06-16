# Engine 11 — GTM Flywheel

> **Purpose:** the system's learning loop — attribution, insight, and ICP feedback. It watches every signal, play, win, and loss across all ten engines, extracts what predicts pipeline, and feeds closed-deal outcomes back to the ICP Engine.

Spec: [`../../../docs/engines/engine-11-gtm-flywheel.md`](../../../docs/engines/engine-11-gtm-flywheel.md)

This engine is a **passive listener** — it never blocks any upstream engine. It records insight and, when warranted, publishes its own events.

---

## Consumes / Publishes

| Direction | Event | Notes |
|---|---|---|
| consumes | `icp.updated` | keep the flywheel's view of the active ICP version in sync |
| consumes | `account.score_updated` | feed awareness-score movement into metrics history |
| consumes | `account.hot` | note hot moments as candidate attribution touches |
| consumes | `play.fired` | record the touch for later attribution |
| consumes | `play.outcome_recorded` | link play outcomes to deal progression |
| consumes | `crm.synced` | recompute tier metrics on new CRM data |
| consumes | `crm.deal_closed_won` | attribution + metrics + every-5th ICP refresh |
| consumes | `crm.deal_closed_lost` | update anti-ICP model + exclusion suggestions |
| publishes | `flywheel.metrics_updated` | daily or on significant change |
| publishes | `icp.refresh_recommended` | after every 5th new Closed Won → ICP Engine (01) |
| publishes | `flywheel.error` | when a task-completion check fails (verify-before-publish) |

(Source of truth: `consumedBy('gtm-flywheel')` / `publishedBy('gtm-flywheel')` in `lib/events/catalog.ts`.)

---

## API endpoints to build

Under `app/api/v1/flywheel/...`:

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/v1/flywheel/pipeline` | Pipeline by tier dashboard data |
| `GET` | `/api/v1/flywheel/attribution` | Multi-touch attribution data (first / last / linear) |
| `GET` | `/api/v1/flywheel/correlation` | Signal correlation analysis (suppressed below 20 data points) |
| `GET` | `/api/v1/flywheel/metrics` | All flywheel metrics |

Plus the health route (already scaffolded): `GET /api/v1/gtm-flywheel/health`.

---

## DB tables to model

Owned by this engine only — no other engine queries them directly. Defined (commented) in `prisma/schema/gtm-flywheel.prisma`. Every table needs `workspaceId` + a Supabase RLS policy.

- `pipeline_snapshots` — `(id, workspace_id, date, pipeline_by_tier JSONB, win_rate_by_tier JSONB, avg_deal_size_by_tier JSONB)`
- `attribution_events` — `(id, workspace_id, account_id, deal_id, touch_type, signal_id, occurred_before_pipeline, recorded_at)`
- `win_loss_analysis` — `(id, workspace_id, deal_id, outcome, account_attributes JSONB, analyzed_at)`
- `flywheel_metrics` — `(id, workspace_id, metric_key, value, period, calculated_at)`
- `signal_correlation_data` — `(id, workspace_id, signal_combination TEXT[], correlation_score, sample_size, calculated_at)`

---

## Task completion checks

The engine marks its work complete only when ALL are true (else it publishes `flywheel.error`). Encoded in `validation.ts → completionCheck`:

- [ ] Attribution built for every closed deal (signal timeline walked back)
- [ ] Pipeline/win-rate metrics calculated by tier
- [ ] Correlation analysis suppressed below 20 data points (no misleading stats)
- [ ] `flywheel.metrics_updated` published; `icp.refresh_recommended` fired after every 5th win

---

## Build order (mirrors the doc's "How to build it")

1. [ ] **Schema first** — uncomment + complete the Prisma models in `prisma/schema/gtm-flywheel.prisma`; add `workspaceId` + Supabase RLS to every table.
2. [ ] **Event consumer** — `register()` (in `index.ts`) already wires one BullMQ worker per consumed event; flesh out the handlers in `handlers.ts`. Validate payloads first (done) before processing.
3. [ ] **Core logic** — implement the step-by-step job as `service.ts`: `buildAttribution`, `calculateTierMetrics`, `runSignalCorrelation`, `shouldRecommendIcpRefresh` / `buildIcpRefreshRecommendation`, `updateAntiIcp`, `sendWeeklyDigest`, `buildMetricsUpdatedPayload`.
4. [ ] **API routes** — implement the four `/api/v1/flywheel/*` endpoints above.
5. [ ] **Event publisher** — publish via `publisher.ts` ONLY after `completionCheck` passes; otherwise `publishFlywheelError`.
6. [ ] **Tests** — extend `gtm-flywheel.test.ts` with a valid-payload case asserting `flywheel.metrics_updated` (and the every-5th-win `icp.refresh_recommended`).
7. [ ] **Health check** — `GET /api/v1/gtm-flywheel/health` is scaffolded; keep `last_event_processed_at` updated once processing lands.

### LLM tasks (see spec)

- ICP refresh analysis — `Claude Sonnet 4.6` (reuses Engine 01 Mode B pipeline)
- Weekly digest narrative — `Claude Haiku 4.5` (sent via Resend)
- Signal correlation interpretation — `Claude Sonnet 4.6`
- ICP improvement suggestions — `Claude Sonnet 4.6` (approve/dismiss cards)
