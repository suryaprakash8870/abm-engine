# ABM Engine — Technical deployment & architecture guide

> Hand-off document for the client's engineering team and technical stakeholders. Covers what the system is, why the stack was chosen, how the architecture works, and how to deploy and operate it yourself.
>
> This document is accurate to the as-built code as of the MVP. Where the code diverges from older documentation (notably the AI provider and the hosting target), the divergence is called out explicitly — trust the code.

---

## 1. Executive overview

ABM Engine is an end-to-end Account-Based Marketing platform. It ingests an Ideal Customer Profile, sources matching companies, enriches and AI-qualifies them, scores and tiers them, builds a target account list, maps buying committees, tracks buying signals continuously, routes accounts to the right play, writes everything back to the CRM, and feeds closed-won/lost outcomes back into the ICP — a complete GTM flywheel.

It is built as **11 logically-independent engines** that communicate **only through an event bus**. Each engine has one job, owns its own database tables, and exposes its own versioned API. This is a **modular monolith** (one codebase, one deployable image) — not micro-frontends and not yet physically separate microservices — but the engine boundaries are enforced in code so any engine can later be split into its own process without touching the others.

**Headline stack:** TypeScript 5 (strict) everywhere · Next.js 14 (App Router, Node 20) for the web app and `/api/v1` routes · PostgreSQL 15/16 via Supabase with Prisma ORM and row-level security · BullMQ on Redis (Upstash) as the event bus · a pluggable LLM router defaulting to a local Ollama, with Anthropic Claude as the cloud alternative · Tailwind CSS + shadcn/ui on the front end.

**Deployment shape in one paragraph:** the platform runs as one Next.js process plus a BullMQ worker that hosts all 11 engines' event consumers, backed by Postgres and Redis. For the cheapest topology the worker boots *inside* the web process (`RUN_WORKER_IN_WEB=true`); for production you run a dedicated `npm run worker` process alongside the web app. The current live deployment is a free-tier Render blueprint (`abm-web.onrender.com`) with the in-web worker and a local Ollama reached over a Cloudflare tunnel. Self-hosters can deploy the same image to Render, Vercel + managed data, AWS/GCP containers, Docker Compose, or Kubernetes.

---

## 2. Technology stack & rationale

| Layer | Choice | Why we chose it |
|---|---|---|
| Language | TypeScript 5.6 (strict) | One language across front and back end; shared types so event contracts can't drift |
| Runtime | Node.js ≥ 20, ES2022 target | Modern runtime; pinned in `package.json` `engines.node` |
| Web framework | Next.js 14, App Router | Front end + `/api/v1` API routes in one codebase; fastest path to a deployed full-stack app |
| UI | React 18, Tailwind CSS 3.4, shadcn/ui | Utility-first styling; shadcn is copy-in source for full control |
| Database | PostgreSQL 15/16 via Supabase | Managed Postgres + Auth + row-level security in one product |
| ORM | Prisma 5.22 (multi-file schema) | TypeScript-native; one schema file per engine for parallel ownership |
| Event bus | BullMQ 5.34 on Redis (Upstash) | Already in the stack for jobs; pub/sub, retries, DLQ, rate limiting; serverless Redis |
| AI / LLM | Pluggable router: `mock \| ollama \| anthropic` | Local Ollama default (zero per-token cost); Anthropic Claude for cloud reasoning |
| Auth | Supabase Auth + Row Level Security | Tenant isolation enforced at the DB level, not just in app code |
| Validation | Zod 3.23 | Runtime checks on event payloads, API inputs, LLM output shapes |
| Hosting | Render (as-deployed) / Vercel (documented intent) | Render free tier runs web + in-process worker; see §5 |

**TypeScript strict everywhere.** One language across the front end, API routes, and workers means the event payload types, Prisma models, and Zod schemas are all shared and checked at compile time. `strict: true` plus `isolatedModules` and `tsc --noEmit` as a CI gate means a renamed event field breaks the build at every call-site rather than at runtime in production. The trade-off — no JS escape hatch for quick scripts — is intentional; the event contract is too important to leave untyped.

**Next.js App Router.** Putting the marketing-facing app, the authenticated dashboard, and the versioned `/api/v1` backend in a single codebase is the fastest route to a deployable full-stack product and keeps the API and its consumers type-linked. The honest cost is that Next's serverless request model can't host long-running jobs — which is exactly why the engines run on BullMQ workers rather than inside request handlers. `next.config.mjs` marks `bullmq`, `ioredis`, `firecrawl`, and `undici` as server-external packages so they never reach the client bundle, and enables `instrumentationHook` so workers can boot in-process on constrained hosts.

**PostgreSQL + Prisma.** A single relational database with strong consistency per engine, managed by Supabase so we get Auth and row-level security for free. Prisma's multi-file schema (`prismaSchemaFolder` preview feature) gives every engine its own `prisma/schema/<engine>.prisma`, so 11 contributors edit in parallel without merge conflicts. Two connection URLs follow the standard Supabase/pgBouncer split: `DATABASE_URL` (pooled, app runtime) and `DIRECT_URL` (direct, for migrations). The trade-off is that Prisma's generated client must be regenerated on every deploy (`npm run build` runs `prisma generate` first) and Supabase becomes a critical dependency.

**BullMQ / Redis event bus.** We chose BullMQ over Kafka, RabbitMQ, or SQS because it was already in the stack for background jobs and gives us pub/sub (via per-subscriber queues), native TypeScript types, automatic retries with backoff, priorities, rate limiting, and a dead-letter queue out of the box. Kafka was judged operational overkill for MVP volumes; Upstash is serverless so there is no Redis cluster to operate. The entire implementation sits behind `lib/events/`, so a later swap to Kafka is contained to that one layer. The trade-off is that Redis is now a hard dependency and **must run with `noeviction`** so BullMQ never silently drops a job under memory pressure.

**Local Ollama default, Anthropic optional.** Every AI feature calls a single router in `lib/clients/llm.ts` that selects `mock`, `ollama`, or `anthropic`. The default is a **local Ollama** (`qwen2.5:1.5b`) because it has zero per-token cost and no external API dependency — ideal for the free-tier deployment and for clients with data-residency requirements who want inference on their own hardware. Anthropic Claude is the cloud alternative, with a deliberate two-model split: `claude-sonnet-4-6` for reasoning (ICP synthesis, scoring-formula generation, email drafts, flywheel analysis) and `claude-haiku-4-5` for batch (account qualification, role assignment, signal classification). Haiku is roughly 18× cheaper — qualifying 2,500 accounts costs about $2 on Haiku versus about $37 on Sonnet for identical binary classification — so we never use Sonnet where Haiku suffices. Ollama's endpoint is editable at runtime in Settings (DB config wins over env), so a rotating tunnel URL can be pasted in without redeploying.

> **Note:** older docs (`CLAUDE.md`) describe Anthropic Claude as "the AI." The source of truth is the code: `lib/clients/llm.ts` defaults to Ollama. The model IDs `claude-sonnet-4-6` / `claude-haiku-4-5` are the project's configured constants — treat them as the deployment's identifiers, to be verified against your Anthropic account's model catalogue.

**Tailwind + shadcn/ui.** Tailwind for utility-first styling built via PostCSS; shadcn/ui components are copied into `components/ui/` as source rather than installed as a versioned dependency, so the team owns and can freely modify every component. The trade-off is that shadcn upgrades are manual rather than `npm update`.

**Supabase Auth + RLS.** Multi-tenancy is enforced at the database level: every table carries a `workspace_id` and a row-level security policy keyed on it, so an application bug cannot leak data across workspaces — isolation does not depend on every query remembering to filter. The cost is that RLS policies must be written carefully for every table and Supabase becomes a critical dependency. BYO API keys and OAuth tokens are AES-256-GCM encrypted at rest; `bcryptjs` handles local credential hashing where needed.

---

## 3. Architecture

### 3.1 The 11 engines as an event-driven pipeline

Data enters at Engine 01 and flows forward; one feedback loop returns closed-won/lost outcomes to the ICP.

| # | Engine | Slug | Job |
|---|---|---|---|
| 01 | ICP Engine | `icp-engine` | Build the Ideal Customer Profile |
| 02 | TAM Builder | `tam-builder` | Source all matching companies |
| 03 | Enrichment Engine | `enrichment-engine` | Enrich + AI-qualify accounts |
| 04 | Scoring Engine | `scoring-engine` | Score + tier accounts |
| 05 | TAL Manager | `tal-manager` | Build/maintain the target account list |
| 06 | Contact Engine | `contact-engine` | Source + map buying committees |
| 07 | Signal Engine | `signal-engine` | Track buying signals (always-on) |
| 08 | Awareness Engine | `awareness-engine` | Score awareness + route accounts |
| 09 | Demand Gen Orchestrator | `demand-gen-orchestrator` | Execute the right play |
| 10 | CRM Sync Engine | `crm-sync-engine` | Write all data back to the CRM |
| 11 | GTM Flywheel | `gtm-flywheel` | Attribution + ICP feedback loop |

```
                          ┌─────────────────────────── FORWARD PIPELINE ───────────────────────────┐

  [01 ICP] ──icp.created──▶ [02 TAM] ──tam.search_completed──▶ [03 Enrichment] ──accounts.enriched──▶
  [04 Scoring] ──accounts.scored──▶ [05 TAL Manager] ──┬──▶ [06 Contact Engine] (map buying committee)
                                                        └──▶ [10 CRM Sync]  (write TAL to CRM)

                          ┌─────────────────── ALWAYS-ON SIGNAL LANE ───────────────────┐
  website tracker ┐
  CRM webhooks    ├──▶ [07 Signal Engine] ──account.stage_changed──▶ [08 Awareness] ──▶ [09 Orchestrator]
  email/forms     ┘                                                                          │
                                                                          play fired ────────┘──▶ [10 CRM Sync]
                                                                          (Telegram alert / CRM task)

                          ┌─────────────────────── FEEDBACK LOOP ───────────────────────┐
  [10 CRM Sync] ── imports closed-won / closed-lost deals as events ──▶ [01 ICP]  &  [11 GTM Flywheel]
  [11 GTM Flywheel] ── attribution + listens broadly ── emits ──▶ icp.refresh_recommended ──▶ [01 ICP]
```

### 3.2 The event-bus contract

**Transport:** BullMQ on Redis (Redis Streams), hidden behind `lib/events/`.

**Envelope** — every message carries the same wrapper (`lib/events/types.ts`, `envelope.ts`):

```ts
{ type, payload, workspace_id, correlation_id, timestamp }
```

- `workspace_id` — the tenant; always present.
- `correlation_id` — generated once when a user triggers an ICP build and propagated through every downstream event, so any failure at step 8 can be traced back to the exact ICP/TAM/enrichment run.
- `timestamp` — ISO-8601 publish time.

`makeEnvelope()` is the only constructor; `isValidEnvelope()` is a cheap structural guard every consumer runs before processing.

**Naming:** dot notation — `icp.created`, `accounts.enriched`, `account.stage_changed`. Constants live in `EVENTS` (`lib/events/catalog.ts`) so call-sites never hardcode strings.

**Typed contracts:** `lib/events/types.ts` maps each event name to a frozen payload type via `EventPayloads`. Adding a field is backwards-compatible; **renaming or removing a field is a breaking change that requires a version bump and sign-off from every consuming engine's owner.** Frozen payloads are exactly what let all 11 engines be built in parallel against a stable contract. Events carry self-contained data — e.g. `tam.search_completed` includes `AccountRef[]` (id + domain + name) so Enrichment never has to query TAM's tables.

**Routing & fan-out:** `EVENT_ROUTES` lists, for each event, the one `publishedBy` engine and the N `consumedBy` engines. Because BullMQ is a work queue (one job → one consumer), broadcasting is done by giving **each (event, engine) pair its own queue** — `event.<event>.<engine>` (e.g. `event.icp.created.tam-builder`). `publishEvent()` enqueues one copy per subscriber; an event with zero consumers (e.g. `icp.error`) is a bus no-op that exists only for observability.

**Publish path** (`lib/events/publish.ts`): `publishEvent()` is the only emit path — engines never touch Redis directly. Jobs use `attempts: 5`, exponential backoff (2 s base), `removeOnComplete: 1000`, `removeOnFail: false` (failures retained for inspection).

**Consume path** (`lib/events/consume.ts`): `subscribeToEvent()` wraps a BullMQ `Worker` per (event, engine) queue, validates the envelope, attaches structured logs tagged with engine + `correlation_id`, and runs the handler (default concurrency 5). On final failure the job is forwarded to a single `dead-letter` queue for inspection and manual replay.

**Engine contract** (`lib/engines/contract.ts`): every engine implements `EngineModule` — `{ slug, consumes[], publishes[], register(), health() }`. `assertMatchesCatalog()` fails in dev/test if an engine's declared consumes/publishes drift from the catalog, keeping each engine honest against the frozen routing table.

### 3.3 Why 11 separate engines instead of a monolith

**The case for it:**

- **Independent scaling.** Enrichment (bursty), Signal (high-frequency), and GTM Flywheel (heavy analytics) have very different load profiles. Separate engines can scale on their own once split into their own worker processes.
- **Fault isolation / graceful degradation.** If one engine is down, the others keep working off their local event-sourced copies; a failure doesn't cascade.
- **Parallel team ownership.** Engines build, test, and ship in parallel against the frozen event contract, with no merge conflicts or cross-team coordination.
- **Swappable providers / easy expansion.** Adding a signal source or play type touches one engine, not a rewired monolith. External providers (Apollo, Firecrawl, HubSpot, the LLM) sit behind `lib/clients/*` adapters.

**The honest trade-offs (documented, not hidden):**

- **Operational complexity.** Distributed pub/sub is harder to reason about than a function call. This is why correlation IDs, the dead-letter queue, and structured per-engine logging exist.
- **Eventual consistency.** "CRM written" can mean "write requested and queued," not "confirmed in the CRM" — TAL Manager records the sync request and trusts the async `crm.synced` ack to arrive. Downstream engines read local copies that may briefly lag the publisher.
- **More moving parts / discipline tax.** Because the MVP is one codebase, it is tempting to query a neighbouring engine's table directly. This must be caught in code review. The ADRs candidly flag that Scoring/TAL currently read `account_scores` / `enriched_accounts` directly — a tracked, acknowledged "local snapshot" refactor debt, not a hidden one.

**This is a modular monolith, not micro-frontends and not (yet) microservices.** One Next.js app and one shared image. The engine boundary is *logical* — separate `lib/engines/*` folders, separate DB schemas, events-only communication — not yet physical. The two rules below are what make the boundary real enough that any engine can be peeled into its own service later with **zero changes to the others.**

### 3.4 The "events-only / no cross-engine DB access" rule

Two non-negotiable rules:

1. An engine **never** queries another engine's tables. If it needs that data, it subscribes to the owning engine's events and stores a **local copy**.
2. Engines communicate **only through events** — no direct engine-to-engine API calls.

Together these make each engine a swappable, independently-deployable unit: if engines only ever talk via events and never share tables, extracting any one into its own service requires no changes to the rest.

**One deliberate exception:** the shared `enrichment_cache` table (domain → firmographic/technographic data), **written only by Engine 03 and read-only to all others.** It has no `workspace_id` and is allowed to cross workspaces because it holds only *public* company data — and it is the single biggest cost saver ("enrich salesforce.com once, not once per customer"). This is the only place the no-cross-engine-DB rule is relaxed, and it never holds personal or workspace-private data.

### 3.5 Multi-tenancy: `workspace_id` + RLS

Every table has a `workspace_id` column **and** a Supabase row-level security policy keyed on it; every event envelope also carries `workspace_id`. RLS enforces isolation at the database level, so an application bug cannot leak data across workspaces. The recorded trade-off is that Supabase becomes a critical dependency and RLS policies must be written carefully. Workspace roles are `owner | admin | member`.

### 3.6 Verify-before-publish

An engine publishes its success event **only after an explicit task-completion check passes**; if the check fails it publishes an error event instead. In a pipeline, a half-finished job that reports success silently corrupts everything downstream and is very hard to debug, whereas a failed job that reports failure is recoverable. This is why most error events (`icp.error`, `enrichment.failed`) have no consumers — they exist for the DLQ and observability, not to drive the pipeline. The related rule: **all CRM writes go through Engine 10** (centralised rate-limiting, token refresh, encryption, audit log, latency isolation). Verify-before-publish is honoured without a synchronous cross-engine call by durably queueing the request and trusting the async `crm.synced` ack.

### 3.7 The worker model

In the MVP, one worker process hosts **all 11 engines' event consumers**:

- **Dedicated worker — `npm run worker`** (`workers/index.ts`): the canonical setup. It imports `engines` from `lib/engines/registry.ts` (the only file that imports all 11), calls `engine.register()` on each to wire its BullMQ subscriptions, and handles graceful shutdown on SIGTERM/SIGINT. **At scale, any single engine can run its own worker process unchanged** because the registry and contract make each engine self-contained.
- **In-web fallback — `RUN_WORKER_IN_WEB=true`** (`instrumentation.ts` → `lib/engines/boot-workers.ts`): for hosts without a separate worker plan. Next's `instrumentation.register()` runs once at server boot; when `NEXT_RUNTIME === 'nodejs'` and `RUN_WORKER_IN_WEB === 'true'`, it dynamically imports `boot-workers.ts` and registers every engine's consumers inside the web process, so one service runs both the app and the pipeline.

Two implementation details for self-hosters: the dynamic import **must** stay inside the `NEXT_RUNTIME === 'nodejs'` guard (webpack replaces the literal at build time, making the branch dead code in the edge build so node-only deps like `ioredis`/`crypto` are stripped — an early `return` would break the edge build); and the in-web worker pauses whenever the web service idles, so it is fine for demos but not for always-on processing (see §5).

---

## 4. Runtime topology & infrastructure

The platform runs as up to four logical components, three of which are backing infrastructure:

| Component | What it is | How it runs |
|---|---|---|
| Web app | Next.js app + `/api/v1/*` routes (one route group per engine) | `npm run start` (after `npm run build`) |
| Worker(s) | All 11 engines' event consumers in one process | `npm run worker`, **or** in-web via `RUN_WORKER_IN_WEB=true` |
| PostgreSQL 15/16 | All engine data; Prisma; `workspace_id` + RLS on every table | Supabase / Render Postgres / Docker |
| Redis | Event bus (BullMQ over `ioredis` TCP) + optional REST cache | Upstash / Render Key-Value / Docker — **must be `noeviction`** |
| LLM provider | Router in `lib/clients/llm.ts`: `mock \| ollama \| anthropic` | Local Ollama (via tunnel in cloud) or Anthropic API |

```
                         ┌────────────────────────────────────────────────┐
                         │                  WEB APP (Next.js)              │
   browser ───HTTPS────▶ │   /api/v1/* routes  ·  enqueues events          │
                         │   (optionally hosts in-process worker if         │
                         │    RUN_WORKER_IN_WEB=true)                       │
                         └───────┬───────────────────────────┬─────────────┘
                                 │ Prisma (DATABASE_URL)      │ ioredis (REDIS_URL)
                                 ▼                            ▼
                     ┌────────────────────┐        ┌────────────────────────┐
                     │  PostgreSQL 15/16  │        │   Redis (noeviction)   │
                     │  workspace_id+RLS  │        │   BullMQ job queues     │
                     └────────────────────┘        └───────────┬────────────┘
                                 ▲                              │ drains
                                 │ Prisma                       ▼
                         ┌───────┴──────────────────────────────────────────┐
                         │              WORKER  (npm run worker)             │
                         │   all 11 engines' consumers · publishes events    │
                         └───────────────────────┬──────────────────────────┘
                                                 │ lib/clients/llm.ts
                                                 ▼
                                   ┌──────────────────────────┐
                                   │  LLM: Ollama  or  Anthropic │
                                   │  (Ollama via tunnel in cloud)│
                                   └──────────────────────────┘
```

The web process enqueues events; the worker (standalone or in-web) drains them. `DATABASE_URL`/`DIRECT_URL` and `REDIS_URL` are the only wires; nothing shares a table across engines and nothing calls another engine directly.

---

## 5. Deployment options for self-hosting

All options run the same image. The only real decisions are **where the worker runs** and **which managed data services back it.**

### A. Render (current blueprint) — `render.yaml`

Three free resources, no credit card: `abm-postgres` (free Postgres 16), `abm-redis` (free Key-Value, 25 MB, `noeviction`, internal-only), and `abm-web` (Next.js, free plan, autodeploy, health check `GET /api/v1/icp-engine/health`). The free tier has no worker plan, so the blueprint sets `RUN_WORKER_IN_WEB=true` and the worker boots inside the web process. Migrations run in the build command because free plans don't support `preDeployCommand`.

- **Pros:** genuinely free to stand up; one service runs app + pipeline; managed Postgres and Redis auto-wired.
- **Cons / free-tier caveats:** the web service spins down after ~15 min idle, pausing the in-process worker (queued events wait in Redis and drain on the next request — fine for demos, not always-on); free Postgres expires after ~30 days; free Redis is 25 MB.
- **Pick it when:** you want the fastest possible live demo, or to validate the platform before committing budget. For always-on Render, move to a paid plan and either add a `type: worker` service or set `RUN_WORKER_IN_WEB=false` and run `npm run worker` separately.

### B. Vercel + managed data (documented original intent)

Web app on Vercel; Postgres on Supabase; Redis on Upstash.

- **Pros:** first-class Next.js host, zero-config builds, preview deploys, global edge, autoscaling web tier.
- **Cons:** **Vercel has no long-running worker** — serverless functions can't host the always-on BullMQ consumer, and `RUN_WORKER_IN_WEB` doesn't fit stateless functions. You must run the worker elsewhere (a small VM/container, Railway, Fly, or a Render worker).
- **Pick it when:** you want best-in-class Next.js hosting and are willing to run the worker on a separate always-on box.

### C. AWS / GCP containers

Build an image (a `Dockerfile` is not yet in the repo — you author it) and run two services: web (`npm run start`) and worker (`npm run worker`), backed by RDS/Cloud SQL Postgres and ElastiCache/Memorystore Redis (`noeviction`). ECS Fargate or Cloud Run for web; a dedicated always-on task/service for the worker.

- **Pros:** production-grade — HA, autoscaling, private networking, managed backups/failover, independent web/worker scaling, secrets via Secrets Manager.
- **Cons:** most ops overhead; you write the Dockerfile, CI/CD, and IaC. **Cloud Run scales web to zero, which is wrong for the worker** — run the worker as an ECS service or Cloud Run with `min-instances=1`. Run migrations as a deploy step or one-off task.
- **Pick it when:** this is your production target and you already operate on AWS or GCP.

### D. Docker Compose (local / single box)

`docker-compose.yml` provisions only the stateful backing services — `postgres:16` and `redis:7-alpine`, each with a named volume and healthcheck. You run the Next.js app and worker on the host pointed at `localhost:5432` / `localhost:6379`.

- **Pros:** zero cost, fast iteration, full control, persistent data — the documented local dev path.
- **Cons:** the app itself isn't containerized (no app Dockerfile yet); single host, no HA; you manage TLS, backups, and uptime.
- **Pick it when:** local development or a single-box internal deployment.

### E. Kubernetes

Two Deployments (web + worker) sharing one image and a Secret/ConfigMap, managed Postgres + Redis (or in-cluster operators), an Ingress for the web Service, and a migration **Job** or init-container running `prisma migrate deploy` before rollout.

- **Pros:** maximum control, independent horizontal scaling (including per-engine workers once `workers/index.ts` is split), self-healing, cloud-portable.
- **Cons:** highest complexity for an MVP that runs fine as two processes; you operate the cluster, secrets, autoscaling, and migration ordering.
- **Pick it when:** you're already standardized on Kubernetes.

**Production-grade recommendation:** option C or E — a **web service plus a dedicated `npm run worker` service** (`RUN_WORKER_IN_WEB=false`), both sharing the same `ENCRYPTION_KEY`, backed by managed Postgres (with `DATABASE_URL` pooled + `DIRECT_URL` direct) and managed Redis (`noeviction`). This is the only topology that gives you always-on signal processing plus independent web/worker scaling.

---

## 6. Environment & secrets

`Req` = required for the app to function. Most data/AI providers fall back to deterministic **mock** data when their key is unset, so the full pipeline runs end-to-end with zero credentials.

### Core app & secrets

| Var | Req? | Unlocks |
|---|---|---|
| `NEXT_PUBLIC_APP_URL` | Req | App origin (auto-wired on Render) |
| `NODE_ENV` | Req | `production` in prod |
| `AUTH_SECRET` | Req | Session-cookie signing key; falls back to `ENCRYPTION_KEY` if unset |
| `ENCRYPTION_KEY` | Req | 32-byte hex; AES-256-GCM for stored BYO/OAuth tokens. Must match across web + worker. Rotating it requires re-encrypting all stored tokens |
| `RUN_WORKER_IN_WEB` | Cloud | `true` boots the worker in the web process (free-tier topology) |
| `NEXT_PUBLIC_TRACKER_CDN_URL` | Opt | CDN URL for `tracker.js` |

Generate the two crypto secrets as 32-byte hex: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` or `openssl rand -hex 32`.

### Database (PostgreSQL / Supabase)

| Var | Req? | Unlocks |
|---|---|---|
| `DATABASE_URL` | Req | Pooled Postgres connection (app runtime) |
| `DIRECT_URL` | Req | Direct connection (migrations) |
| `NEXT_PUBLIC_SUPABASE_URL` | Opt* | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Opt* | Public anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Opt* | Server-only; never client-exposed |

\*Required only if you run the Supabase-backed auth/RLS path; the Render blueprint uses plain Postgres + the app's own `AUTH_SECRET` session cookies.

### Redis (event bus)

| Var | Req? | Unlocks |
|---|---|---|
| `REDIS_URL` | Req | `rediss://…` TCP for BullMQ/ioredis (auto-wired on Render) |
| `UPSTASH_REDIS_REST_URL` | Opt | REST client for dedup/rate-limit caches |
| `UPSTASH_REDIS_REST_TOKEN` | Opt | REST token |

### LLM

| Var | Req? | Unlocks |
|---|---|---|
| `LLM_PROVIDER` | Opt | `mock \| ollama \| anthropic` (preferred selector) |
| `ICP_LLM` | Opt | Legacy alias of `LLM_PROVIDER` |
| `ANTHROPIC_API_KEY` | Cond | Required if provider resolves to `anthropic` |
| `OLLAMA_URL` | Cond | Required if `ollama` and not localhost (tunnel URL); default `http://localhost:11434` |
| `OLLAMA_MODEL` | Opt | Default `qwen2.5:1.5b` |

Selection logic: `LLM_PROVIDER` wins, else `ICP_LLM`, else `anthropic` if `ANTHROPIC_API_KEY` is set, else `mock`. Ollama config resolves DB runtime config → env → localhost default.

### BYO data-provider keys (all optional — unset = mock data)

| Var | Engine / use |
|---|---|
| `APOLLO_API_KEY` | Engine 02 TAM (companies) |
| `TAM_ACCOUNT_LIMIT` | Caps companies per build (keep small on credit-limited Apollo) |
| `CLEARBIT_API_KEY` | Enrichment (path is a TODO) |
| `BUILTWITH_API_KEY` | Technographics (reserved, no client) |
| `RB2B_API_KEY` | Visitor de-anonymization (reserved, no client) |
| `FIRECRAWL_API_KEY` (`FIRECRAWL_SOURCE=mock`) | Web-research signals (Engines 03/07) |
| `THEIRSTACK_API_KEY` (`THEIRSTACK_SOURCE=mock`) | Job/tech signals (Engine 07) |
| `AI_ARK_API_KEY` | B2B company/people data (reserved, no client) |

### CRM

| Var | Unlocks |
|---|---|
| `HUBSPOT_SERVICE_KEY` | HubSpot private-app token (Render blueprint path) |
| `HUBSPOT_CLIENT_ID` / `HUBSPOT_CLIENT_SECRET` / `HUBSPOT_WEBHOOK_SECRET` | HubSpot OAuth public-app flow |
| `SALESFORCE_CLIENT_ID` / `SALESFORCE_CLIENT_SECRET` | Salesforce (future) |

### Notifications, billing, auth integrations

| Var | Unlocks |
|---|---|
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` | Play alerts (Engine 09); per-workspace overrides in Integrations hub |
| `SLACK_CLIENT_ID` / `SLACK_CLIENT_SECRET` / `SLACK_SIGNING_SECRET` | Slack app (allowlisted, no client yet) |
| `RESEND_API_KEY` / `EMAIL_FROM` | Transactional email (action is a stub) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google login (unset = email/password only) |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` / `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` / `STRIPE_PRICE_GROWTH_MONTHLY` / `STRIPE_PRICE_SCALE_MONTHLY` | Billing |

### Analytics & errors

| Var | Unlocks |
|---|---|
| `NEXT_PUBLIC_POSTHOG_KEY` / `NEXT_PUBLIC_POSTHOG_HOST` | Product analytics (the only cross-cutting service actually wired) |
| `NEXT_PUBLIC_SENTRY_DSN` / `SENTRY_AUTH_TOKEN` | Error tracking |

**Naming rule:** anything prefixed `NEXT_PUBLIC_*` is shipped to the browser. Server-only secrets (`SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `STRIPE_SECRET_KEY`, `ENCRYPTION_KEY`, etc.) must **never** carry that prefix.

> On Render, `DATABASE_URL`, `DIRECT_URL`, `REDIS_URL`, and `NEXT_PUBLIC_APP_URL` are auto-wired from the blueprint — do not set them by hand. Secrets marked `sync: false` are intentionally blank on first deploy; the first deploy stalls until you fill them in the dashboard, then redeploys automatically.

---

## 7. Third-party integrations & the 2026 ABM Playbook

This is the **code-native version of the client's 2026 ABM Playbook**: where the playbook uses Clay AI as the no-code orchestration brain, we own that logic in our own 11-engine event-driven backend. Clay is therefore intentionally *not* integrated — its orchestration is replaced by engine code.

### The BYO-key model — three secret mechanisms

1. **BYO encrypted keys** (`integration_keys` table) for data/delivery providers. Route: `app/api/v1/integrations/keys/route.ts` — `GET` lists configured providers (never returns keys), `POST {provider, key}` encrypts and upserts, `DELETE` removes. Allowlist: `apollo, clearbit, clay, ai-ark, firecrawl, theirstack, slack, resend, telegram`. Keys are AES-256-GCM encrypted (`lib/engines/crm-sync-engine/crypto.ts`), scrypt-derived from `ENCRYPTION_KEY`, per-workspace (`(workspace_id, provider)` unique). **Fails closed in production if `ENCRYPTION_KEY` is unset.**
2. **OAuth / service key** for the CRM, behind the Engine-10 `CrmAdapter` boundary (CRM is deliberately *excluded* from the BYO allowlist).
3. **`LLM_PROVIDER`** for AI.

**Mock-until-keyed:** every data client is free and deterministic until a real key is present (`shouldUseMock()`), so the whole pipeline runs end-to-end with zero credentials. Apollo additionally *degrades to mock on a live-but-inaccessible plan* (401/403 → mock) to honour "never block the pipeline."

### Integrated today vs. needed

**Live code path today:** Apollo (company/people search, email verify), Firecrawl (site/news scrape, Redis-cached), TheirStack (job postings → signals), HubSpot (read + write adapter; OAuth token exchange still stubbed, service-key path works), Telegram (the only wired play-delivery channel), Ollama/Anthropic, and first-party web tracking (`public/tracker.js` + inbound webhooks).

**Allowlisted but not wired:** Clearbit (enrich path is a TODO), Clay (intentionally replaced by our code), AI-Ark, Slack (no client — alerts go to Telegram only), Resend (email action is a logged stub).

**Entirely missing playbook tools:** RB2B/Warmly (real visitor ID — the one true gap for 1st-party signals; `RB2B_API_KEY` reserved, currently mocked), BuiltWith/Bombora/PredictLeads (3rd-party intent), G2/Crossbeam (2nd-party), HeyReach/Instantly/Smartlead (email + dialing), Ocean.io/Sales Navigator/Store Leads (alt TAM DBs), LinkedIn/HubSpot ABM Ads, and Salesforce (adapter coded in `apps/` but untested, not selectable from the app).

### Playbook tool → engine → status → key to provision

| Playbook category | Playbook tools | Our engine | Status | Self-hoster provisions |
|---|---|---|---|---|
| CRM (system of record) | HubSpot, Salesforce | 10 CRM Sync | HAVE (HubSpot) / PARTIAL (Salesforce untested) | `HUBSPOT_CLIENT_ID/SECRET/WEBHOOK_SECRET` **or** `HUBSPOT_SERVICE_KEY`; Salesforce: `SALESFORCE_INSTANCE_URL` + `SALESFORCE_ACCESS_TOKEN` |
| TAM databases | Apollo, AI Ark, Ocean.io, Sales Navigator, Store Leads | 02 TAM Builder | HAVE (Apollo) / MISSING (rest) | `APOLLO_API_KEY` (slug `apollo`), optional `TAM_ACCOUNT_LIMIT`; AI-Ark `AI_ARK_API_KEY` (no client) |
| Scraping / web research | Apify, Octoparse, Python | 03 · 07 (Firecrawl) | HAVE (Firecrawl substitutes) | `FIRECRAWL_API_KEY` (slug `firecrawl`) |
| Enrichment + qualification | Clay, Clearbit | 03 Enrichment | PARTIAL (Clay replaced by our code; Clearbit TODO) | Clay: nothing (replaced); Clearbit `CLEARBIT_API_KEY` (wire still TODO); LLM via Ollama/Anthropic |
| Scoring | Clay, ChatGPT | 04 Scoring | HAVE (own engine + our LLM) | No 3rd-party key — `LLM_PROVIDER` drives any AI scoring |
| ABM Ads | HubSpot Ads, LinkedIn | 08/09 routing | MISSING | Not integrated |
| 1st-party signals | RB2B, Warmly, product usage, forms, webinar | 07 Signal Engine | PARTIAL (tracker + webhooks live; visitor→company mocked) | Embed `public/tracker.js` (workspace token); real visitor ID `RB2B_API_KEY` (reserved, no client); forms/usage via HMAC webhooks |
| 2nd-party signals | G2, Crossbeam, LinkedIn engagement | 07 Signal Engine | MISSING | None integrated |
| 3rd-party signals | BuiltWith, Bombora + PredictLeads, news, funding | 03 · 07 | PARTIAL (TheirStack + Firecrawl live) | `THEIRSTACK_API_KEY` + `FIRECRAWL_API_KEY`; BuiltWith `BUILTWITH_API_KEY` (reserved, no client); Bombora/PredictLeads not integrated |
| Lead routing | Slack, CRM tasks | 09 → 10 | HAVE (Telegram + CRM tasks) / PARTIAL (Slack unwired) | CRM tasks via HubSpot adapter; alerts via Telegram (`TELEGRAM_BOT_TOKEN`+`TELEGRAM_CHAT_ID`); Slack `SLACK_CLIENT_ID/SECRET/SIGNING_SECRET` (no client yet) |
| Demand gen | email, parallel dialing, retargeting, webinars, social | 09 Orchestrator | PARTIAL (play-firing + Telegram live; rest stubs) | Email `RESEND_API_KEY` (stub); dialing/retargeting/social not integrated |
| GTM Flywheel → Closed Won → ICP | (internal loop) | 11 + 10 import | HAVE | No 3rd-party key — `importFromCrm` republishes closed-won/lost as events |

**Highest-value gaps to build/provision, in order:** RB2B (the only thing making 1st-party visitor signals "real"), then the Slack and Resend clients (allowlisted but unwired), then BuiltWith/Bombora/PredictLeads/G2/Crossbeam intent sources, then finishing Salesforce OAuth and live HubSpot token exchange.

---

## 8. Database, migrations & backups

**Schema.** Prisma multi-file schema (`prismaSchemaFolder` preview feature): the datasource and generator live in `prisma/schema/schema.prisma`; each engine owns `prisma/schema/<engine-slug>.prisma`, plus `integrations.prisma`. `package.json` points Prisma at the folder (`"prisma": { "schema": "prisma/schema" }`). Models are PascalCase singular, mapped to snake_case plural tables (`Workspace` → `workspaces`).

**Two connection URLs.** `DATABASE_URL` (pooled, app runtime) and `DIRECT_URL` (direct, migrations) — the standard Supabase/pgBouncer split. On Render both point at the same connection string.

**Migrations.** 12 migrations under `prisma/migrations/` (timestamped, `provider = "postgresql"`), spanning the scoring, TAL, contact, signal, awareness, demand-gen, CRM-sync, GTM-flywheel, and integration-keys engines. Apply them with **`npx prisma migrate deploy`** — the production-safe command that applies pending migrations and never resets. Some migrations use `CREATE TABLE/INDEX IF NOT EXISTS` to tolerate tables already created via `db push` in dev. On Render this runs inside `buildCommand` (free plans have no `preDeployCommand`).

**Never in production:** `prisma migrate dev` or `prisma db push` — those are dev-only. Local dev authors migrations with `npx prisma migrate dev --name "description"` (`npm run prisma:migrate`).

**Backups.** Backups come from the managed Postgres provider, not the app:
- Supabase — automated daily backups (and point-in-time recovery on paid tiers).
- RDS / Cloud SQL — enable automated backups and a retention window; both support PITR.
- **Render free Postgres expires after ~30 days** — not a backup; export your data before then or move to a paid/managed database for anything you can't lose.
Always take a fresh backup (or snapshot) immediately before running a migration that alters existing tables.

---

## 9. Scaling path: MVP → production

| Stage | Web | Worker | Data | Observability |
|---|---|---|---|---|
| **MVP (free)** | Render free, spins down idle | In-web (`RUN_WORKER_IN_WEB=true`) | Render free Postgres (~30-day) + free Redis (25 MB) | PostHog; logs in dashboard |
| **Always-on** | Paid web (stays warm) | Dedicated `npm run worker` (`RUN_WORKER_IN_WEB=false`) | Managed Postgres + Redis | + DLQ monitoring, correlation-ID tracing |
| **Production** | Autoscaled web (ECS/Cloud Run/K8s) | Dedicated autoscaled worker | RDS/Cloud SQL (PITR) + ElastiCache/Memorystore (`noeviction`) | + Sentry, alerting on DLQ depth & queue lag |
| **At scale** | Same | **Per-engine workers** — split `workers/index.ts` so hot engines (Enrichment, Signal, Flywheel) scale independently | Read replicas; per-engine connection budgets | Per-engine dashboards |

The path is deliberately incremental. The single biggest production step is **splitting the worker out of the web process** so signal/always-on engines run continuously. The next, only-when-needed step is splitting individual engines into their own worker processes — possible with zero code changes to the others because nothing shares a table and everything flows through the typed event bus.

---

## 10. Self-deployment runbook (happy path)

This is the Render free-tier path; for production substitute managed Postgres/Redis and a dedicated worker (§5, §9).

1. **Provision backing services.** Use the `render.yaml` blueprint (creates `abm-postgres`, `abm-redis`, `abm-web`), or stand up your own Postgres 15/16 and Redis (`noeviction`).
2. **Generate the two crypto secrets** (32-byte hex each): `AUTH_SECRET` (session HMAC) and `ENCRYPTION_KEY` (BYO-key AES). `openssl rand -hex 32`. Keep `ENCRYPTION_KEY` identical across web and worker.
3. **Set environment variables.** On Render, `DATABASE_URL`, `DIRECT_URL`, `REDIS_URL`, `NEXT_PUBLIC_APP_URL` are auto-wired; fill the `sync: false` secrets in the dashboard. Minimum to function: `AUTH_SECRET`, `ENCRYPTION_KEY`, plus an LLM choice. All provider keys are optional (mock fallback).
4. **Choose the LLM provider.** Cloud: `LLM_PROVIDER=anthropic` + `ANTHROPIC_API_KEY` (recommended for an always-up host). Or local Ollama exposed through a stable Cloudflare tunnel: set `OLLAMA_URL` to the tunnel URL (editable later in Settings without redeploy). Render cannot reach `localhost` Ollama.
5. **Build.** Render free: `npm ci --include=dev && npx prisma migrate deploy && npm run build`. Generic host: `npm ci && npx prisma migrate deploy && npm run build`. (`--include=dev` forces the build-time devDeps Next needs; `npm run build` runs `prisma generate` first.)
6. **Start.** Web: `npm run start`. If you set `RUN_WORKER_IN_WEB=true`, the worker boots in-process. Otherwise also run `npm run worker` as a separate service.
7. **Verify health.** `GET /api/v1/icp-engine/health` should return 200.
8. **Wire OAuth callbacks.** Update the Google OAuth redirect URI to `https://<your-host>/api/v1/auth/google/callback`. Configure HubSpot OAuth or set `HUBSPOT_SERVICE_KEY`.
9. **Smoke-test the pipeline.** Trigger an ICP build from the app and confirm events flow forward (correlation-ID tracing in logs). With no provider keys, the full pipeline runs on mock data — proof the wiring is correct before you add real keys.
10. **Add real provider keys** as needed via the Integrations hub (AES-encrypted, per workspace) or env vars: Apollo, Firecrawl, TheirStack, HubSpot, Telegram.

> Two doc discrepancies to ignore in favour of the code: `deploy-render.md` says migrations run in `preDeployCommand` and references an `abm-worker` service — the actual `render.yaml` runs migrations in `buildCommand` and defines no worker service (free tier uses `RUN_WORKER_IN_WEB`). Trust `render.yaml`.

---

## 11. Security & operations

**Secrets.** No secrets in code — all via environment variables. BYO API keys and CRM OAuth tokens are **AES-256-GCM encrypted at rest** (one crypto boundary in `lib/engines/crm-sync-engine/crypto.ts`, scrypt-derived from `ENCRYPTION_KEY`; blob = `base64(iv).base64(tag).base64(ct)`), and the key endpoint **fails closed in production** if `ENCRYPTION_KEY` is unset. `ENCRYPTION_KEY` must match between web and worker; rotating it requires re-encrypting all stored tokens. Anything `NEXT_PUBLIC_*` is shipped to the browser — never put a secret behind that prefix.

**Multi-tenant isolation (RLS).** Every table has `workspace_id` + a row-level security policy; every event envelope carries `workspace_id`. Isolation is enforced at the database level, so an application bug cannot leak cross-workspace data. **Operational must-have:** confirm an RLS policy exists on every table before going live, and keep `enrichment_cache` (the one cross-workspace table) free of any personal or workspace-private data — it is allowed across tenants only because it holds public firmographics.

**Encryption in transit.** Use `rediss://` (TLS) for `REDIS_URL` and TLS Postgres connections. The host (Render/Vercel/your LB) terminates HTTPS for the web app.

**CRM write discipline.** All CRM writes funnel through Engine 10's `CrmAdapter` (search-then-upsert, so re-syncs never duplicate; failures return `{ok:false}` and dead-letter one record rather than crashing the batch). No other engine touches a CRM. This centralises rate-limiting (HubSpot 429-retry with backoff), token refresh, encryption, and the audit trail.

**Monitoring & operations.**
- **Dead-letter queue** — a single `dead-letter` queue retains every job that exhausts its 5 attempts (`removeOnFail: false`). Monitor its depth; it is your primary failure signal and supports manual replay.
- **Correlation-ID tracing** — every log line is tagged with engine + `correlation_id`, so any downstream failure traces back to the originating ICP/TAM run.
- **Health checks** — each engine exposes a health endpoint (e.g. `/api/v1/icp-engine/health`); wire these to your platform's health probe.
- **Analytics & errors** — PostHog is wired today (`NEXT_PUBLIC_POSTHOG_*`). Sentry is documented and env-ready (`NEXT_PUBLIC_SENTRY_DSN`) but not yet installed — add it for production error tracking.
- **Redis must be `noeviction`** so BullMQ never drops a queued job under memory pressure.

**LLM data-residency note.** This is a genuine architectural choice, not just a cost lever. With the **Ollama** provider, all inference runs on infrastructure you control (on-prem or your own tunnel) — no account data, account text, or signal content ever leaves your environment, which suits clients with strict data-residency or confidentiality requirements. With the **Anthropic** provider, the relevant prompt content is sent to Anthropic's API for inference; choose this when cloud availability and reasoning quality outweigh on-prem residency, and review it against your data-handling obligations. Because both sit behind the single `lib/clients/llm.ts` router, you can switch per deployment via `LLM_PROVIDER` without touching engine code.

---

### Key file references

`render.yaml` · `docs/project/deploy-render.md` · `docs/project/environment.md` · `.env.example` · `docker-compose.yml` · `package.json` · `next.config.mjs` · `instrumentation.ts` + `lib/engines/boot-workers.ts` · `workers/index.ts` · `lib/engines/{registry,contract}.ts` · `lib/events/{catalog,types,publish,consume,dead-letter}.ts` · `lib/clients/{llm,anthropic,apollo,firecrawl,theirstack,telegram}.ts` · `lib/engines/crm-sync-engine/{crypto,crm-adapter}.ts` · `app/api/v1/integrations/keys/route.ts` · `prisma/schema/schema.prisma` · `prisma/migrations/` · `docs/project/decisions.md` (ADRs 001–022).