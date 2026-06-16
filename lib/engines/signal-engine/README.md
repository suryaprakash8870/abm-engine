# Signal Engine (07)

> Track all buying signals in real time. Category: Intelligence (always-on) · Status: MVP · Owner: _unassigned_

The Signal Engine never stops running. It watches website visits, CRM/email
webhooks, and scheduled 3rd-party polls; resolves each signal to a TAL account;
normalises it to a common schema; deduplicates it (5-minute Redis window); and
publishes `signal.received` for the Awareness Engine (08) to score.

Full spec: [`../../../docs/engines/engine-07-signal-engine.md`](../../../docs/engines/engine-07-signal-engine.md)

## Events

| Direction | Event | Counterpart |
|---|---|---|
| Consumes | `contacts.mapped` | from Contact Engine (06) — attribute signals to specific contacts |
| Publishes | `signal.received` | consumed by Awareness Engine (08) |

> Most signal intake is via the HTTP routes/webhooks below, **not** the event
> bus. `contacts.mapped` is consumed only to keep the account→contact
> attribution map fresh.

## API endpoints to build

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/v1/signals/track` | Tracking snippet intake (public, workspace token auth) |
| `POST` | `/api/v1/webhooks/hubspot` | HubSpot webhook receiver (verify signature) |
| `POST` | `/api/v1/webhooks/outreach` | Outreach webhook receiver (verify signature) |
| `GET` | `/api/v1/signals/snippet/:token` | Serve the tracking JS snippet |
| `GET` | `/api/v1/signals/account/:account_id` | All signals for an account |
| `GET` | `/api/v1/signal-engine/health` | Health probe (already scaffolded) |

## DB tables to model (this engine owns)

See [`../../../prisma/schema/signal-engine.prisma`](../../../prisma/schema/signal-engine.prisma).
No other engine queries these directly — they listen to this engine's events.

- `signals` — every normalised, deduplicated signal (idempotent on `dedup_key`)
- `signal_sources` — configured sources per workspace (`source_type`, `config`, `is_active`)
- `webhook_log` — every webhook delivery (`source`, `payload`, `signature_valid`, `processed_at`)
- `tracking_tokens` — per-workspace snippet auth tokens
- `visitor_sessions` — website sessions (`session_id`, `account_id`, `ip_hash`, first/last seen)

Add `workspaceId` to every table and a Supabase RLS policy per table.

## Task completion check (gates the success publish — ADR-003)

The engine publishes `signal.received` only when ALL are true; otherwise it
publishes its error event. Encoded in `validation.ts` → `completionCheck()`.

- [ ] A valid signal is matched to a TAL account
- [ ] Signal deduplicated (idempotency key prevents double-counting)
- [ ] Signal normalised to the common schema and stored
- [ ] `signal.received` event published

## Build-order checklist

1. **Schema first** — fill in `prisma/schema/signal-engine.prisma` (models + `workspaceId` + RLS).
2. **Event consumer** — `register()` subscribes `contacts.mapped` → `handleContactsMapped` (already wired).
3. **Core logic** — implement the step-by-step job in `service.ts` (resolve IP, classify intent, verify webhook, normalise, dedup, store).
4. **API routes** — build the endpoints above under `app/api/v1/...`.
5. **Event publisher** — call `publishSignalReceived()` only after `completionCheck()` passes (`publisher.ts`).
6. **Tests** — extend `signal-engine.test.ts` (replace the simulated publish with the real intake/service path).
7. **Health check** — `GET /api/v1/signal-engine/health` (already scaffolded → `app/api/v1/signal-engine/health/route.ts`).

## Files in this folder

| File | Purpose |
|---|---|
| `index.ts` | `EngineModule` — slug, consumes/publishes, `register()`, `health()` |
| `handlers.ts` | One async handler per consumed event |
| `service.ts` | Step-by-step job logic (stubs) |
| `publisher.ts` | Thin wrapper per published event |
| `validation.ts` | Payload validators + `completionCheck()` |
| `signal-engine.test.ts` | Integration test (catalog match + captured publish) |
