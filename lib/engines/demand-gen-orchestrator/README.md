# Engine 09 — Demand Gen Orchestrator

**Purpose:** Execute the right play at the right time — turn awareness triggers into rep action (CRM tasks, Slack alerts, AI email drafts, sequence enrolments) and log every outcome.

> Spec: [../../../docs/engines/engine-09-demand-gen-orchestrator.md](../../../docs/engines/engine-09-demand-gen-orchestrator.md)
> Owner: _unassigned_ · Status: MVP scaffold (stubs — fill in the TODO(owner)s)

---

## Consumes / Publishes

| Direction | Event | Counterparty |
|---|---|---|
| Consumes | `account.stage_changed` | from Awareness Engine (08) — primary trigger |
| Consumes | `account.hot` | from Awareness Engine (08) — urgent trigger |
| Publishes | `play.fired` | to CRM Sync (10) + GTM Flywheel (11) |
| Publishes | `play.outcome_recorded` | to GTM Flywheel (11) + ICP Engine (01) |

Depends on: Awareness (08, primary trigger), Contact (06, needs contacts), Scoring/TAL (needs tier — local copy).

---

## API endpoints to build

Under `app/api/v1/...`:

| Method | Path | Description |
|---|---|---|
| `GET`  | `/api/v1/plays/feed` | Active play queue for the current user |
| `POST` | `/api/v1/plays/fire` | Manually trigger a play |
| `PUT`  | `/api/v1/plays/:id/outcome` | Log play outcome |
| `POST` | `/api/v1/plays/:id/snooze` | Snooze a play for N days |
| `POST` | `/api/v1/plays/generate-draft` | Generate AI email draft (v1.1) |
| `GET`  | `/api/v1/demand-gen-orchestrator/health` | Health probe (scaffolded) |

---

## DB tables to model

Defined as commented stubs in `prisma/schema/demand-gen-orchestrator.prisma`. Each needs `workspace_id` + a Supabase RLS policy.

- `plays_log` — every fired play + its execution method, status, CRM/Slack ids, outcome.
- `play_templates` — the tier × stage play matrix (`template_config` JSONB).
- `play_outcomes` — recorded outcomes per play.
- `suppression_rules` — cooldown / max-per-month / snooze / unsubscribe rules.
- `sequence_mappings` — tier × industry × role → external sequence id.
- `ai_draft_log` — generated subject lines + body + model used.

---

## Task-completion checks (verify-before-publish, ADR-003)

Encoded verbatim in `validation.ts` → `completionCheck()`. Publish `play.fired` ONLY when ALL pass; otherwise surface an error.

- [ ] Play matrix evaluated and correct play selected
- [ ] Suppression checked BEFORE any external call (atomic check-and-lock)
- [ ] CRM task created and/or Slack notification sent
- [ ] `play.fired` event published and logged

---

## Build order (mirrors the doc's "How to build it")

1. **Schema first** — uncomment + complete the Prisma models; add `workspace_id` + RLS to every table.
2. **Event consumer** — `register()` already subscribes the trigger events; flesh out the handlers in `handlers.ts`.
3. **Core logic** — implement the step-by-step job in `service.ts` (`evaluatePlayMatrix` → `checkSuppression` → `fireTier1Play` / `fireTier23Play` → `logPlay` → `runOrchestration`).
4. **API routes** — implement the endpoints above under `app/api/v1/...`.
5. **Event publisher** — call `publishPlayFired` / `publishPlayOutcomeRecorded` (publisher.ts) only after `completionCheck` passes.
6. **Tests** — extend `demand-gen-orchestrator.test.ts`: feed a known trigger, assert the correct output event + payload.
7. **Health check** — `GET /api/v1/demand-gen-orchestrator/health` is wired to `engine.health()`.

---

## Files in this folder

- `index.ts` — the `EngineModule` (slug, consumes/publishes, `register()`, `health()`).
- `handlers.ts` — one handler per consumed event (validate → orchestrate → publish).
- `service.ts` — core step functions (stubs).
- `publisher.ts` — thin typed wrappers around `publishEvent` for each output event.
- `validation.ts` — payload guards + the `completionCheck`.
- `demand-gen-orchestrator.test.ts` — the required integration test.
