# DECISIONS.md

> Architecture Decision Record (ADR). Each entry: the decision, why, and what was rejected. Append new decisions with a date; don't rewrite history.

---

## ADR-001: Do not build a CRM — integrate with existing ones
**Date:** 2026-06-09 · **Status:** Accepted

**Decision:** The product is an intelligence layer on top of the customer's existing CRM (HubSpot/Salesforce). We never build or own a CRM.

**Why:** A CRM is a multi-year product, and every target customer already has one. Building one means competing with billion-dollar incumbents on the least differentiated part of the stack.

**Rejected:** Building an in-house CRM; running with "no CRM" (not viable — customer data lives in their CRM).

---

## ADR-002: Buy the plumbing, build the logic
**Date:** 2026-06-09 · **Status:** Accepted

**Decision:** Buy/integrate data + delivery (CRM, enrichment, contacts, ads, email sending, intent data). Build the logic (Win/Loss, ICP, Scoring, Signal Scorer, Awareness, Orchestrator, Adapter, dashboard).

**Why:** The moat is the scoring/signal/orchestration logic. Data and delivery are commodities better bought via API.

**Rejected:** Building an enrichment/data company; building an email-sending/deliverability engine.

---

## ADR-003: Five-component architecture
**Date:** 2026-06-09 · **Status:** Accepted

**Decision:** Enrichment → Scoring → Signal Scorer → Orchestrator → CRM Adapter, each a separate module with a clean interface. Only the CRM Adapter talks to the CRM.

**Why:** Isolates CRM-specific code (adding a CRM = one new adapter), keeps the pipeline testable, matches the engine design already iterated on internally.

**Rejected:** Monolithic service with CRM calls scattered throughout.

---

## ADR-004: Backend = NestJS (Node + TypeScript)
**Date:** 2026-06-09 · **Status:** Accepted

**Decision:** NestJS for the backend.

**Why:** (1) One language across stack with the Next.js frontend (shared types). (2) ABM is mostly API orchestration + webhooks — Node's sweet spot. (3) Matches existing RankNova/Fastify experience. (4) NestJS gives structure (modules/DI) suited to the 5-component design.

**Rejected:**
- **Flask** — too bare-bones for a structured multi-module SaaS; would end up rebuilding what NestJS provides.
- **FastAPI** — strong, but reserve for *if/when* ML-based predictive scoring is added. Revisit then.

---

## ADR-005: Frontend = Next.js (App Router) + TypeScript
**Date:** 2026-06-09 · **Status:** Accepted

**Decision:** Next.js App Router, TypeScript, Tailwind, shadcn/ui, Tremor for dashboards, TanStack Query for data.

**Why:** SSR + SEO (we sell a GTM tool — our own site must rank), API routes, integrated auth handling, ownable dashboard components. Plain React (Vite) would mean bolting on SSR/router/backend separately.

**Rejected:** Plain React + Vite (more glue work, no SSR/SEO out of the box).

---

## ADR-006: Database = PostgreSQL via Supabase, ORM = Drizzle
**Date:** 2026-06-09 · **Status:** Accepted

**Decision:** PostgreSQL on Supabase; Drizzle ORM; Redis for caching.

**Why:** Relational data (accounts → contacts → signals → scores) with heavy querying. Supabase bundles Postgres + auth + RLS + realtime, and is already in use (Olive). Drizzle already used on RankNova.

**Rejected:** NoSQL (relationships and queries are core); Prisma (acceptable alternative, but Drizzle chosen for continuity).

---

## ADR-007: Background jobs = BullMQ + Redis (mandatory)
**Date:** 2026-06-09 · **Status:** Accepted

**Decision:** All enrichment and signal processing runs as BullMQ background jobs.

**Why:** Enriching thousands of accounts is slow and rate-limited — it cannot run in a web request. Queueing prevents timeouts and quota blowouts. BullMQ already used on RankNova.

**Rejected:** Synchronous processing in request handlers (a top cause of ABM-tool failure).

---

## ADR-008: Multi-tenancy from day one via org_id + RLS
**Date:** 2026-06-09 · **Status:** Accepted

**Decision:** Every row carries `org_id`; tenant isolation enforced by Postgres Row-Level Security.

**Why:** Retrofitting tenancy after launch is painful and a security risk. We hold customers' CRM access — isolation is critical.

**Rejected:** Adding tenancy later; app-layer-only isolation (RLS is the safety net).

---

## ADR-009: Signals are weighted and time-decayed (not equal)
**Date:** 2026-06-09 · **Status:** Accepted

**Decision:** The Signal Scorer weights 1st-party signals far above 3rd-party, and decays old signals over time. 3rd-party intent only re-ranks within a tier; it never defines fit.

**Why:** 3rd-party intent data has high false-positive rates. Equal weighting turns the awareness score into noise — the single most common ABM-scoring failure.

**Rejected:** Equal-weight signal aggregation; using 3rd-party intent to define ICP fit.

---

## ADR-010: CRM write-back is upsert (enrich), never overwrite
**Date:** 2026-06-09 · **Status:** Accepted

**Decision:** Write-back matches on a unique key (email/phone). Existing record → add/update fields. New record → insert. Existing data is never deleted or overwritten.

**Why:** Customers must trust us with their CRM. Enrichment adds value; destruction breaks trust and data.

**Rejected:** Replacing records; bulk overwrite without a dedupe key (creates duplicates / data loss).

---

## ADR-011: Phased build with an Awareness-Score validation gate
**Date:** 2026-06-09 · **Status:** Accepted

**Decision:** Build in 4 phases (Core → Brain → Activation → Scale). Before Phase 3, validate that the Awareness Score predicts closed-won rate.

**Why:** Front-loads high-fidelity/low-cost work; defers expensive low-fidelity intent data. An unvalidated awareness score is decoration — the gate forces proof before scaling.

**Rejected:** Building all 15 stages and all integrations at once; shipping the score without validation.

---

## ADR-012: Auth is outsourced (Clerk / Supabase Auth)
**Date:** 2026-06-09 · **Status:** Accepted

**Decision:** Use Clerk or Supabase Auth.

**Why:** Auth is a security specialty; rolling our own is high-risk and low-value.

**Rejected:** Custom auth implementation.

---

## ADR-013: ML served as a scoped Python microservice — not in JS, not as a rewrite
**Date:** 2026-06-09 · **Status:** Accepted

**Decision:** Scoring stays as weighted rules + time-decay in NestJS for now. If/when real ML scoring is justified (only after the rules-based score is proven insufficient at the Phase 2 validation gate), the model runs as a small, separate Python service exposing a single prediction endpoint that NestJS calls like any other external API. NestJS remains the backbone.

**Why:** The JS ML ecosystem is too thin for training/experimentation (fine only for running a pre-trained model for inference). A full Python (FastAPI) rewrite is overkill because orchestration — not computation — dominates this product. The microservice pattern uses the right tool per job and costs little architecturally, since the Orchestrator already treats external calls as normal.

**Rejected:**
- **ML in JavaScript (TensorFlow.js/ONNX)** — fine only for inference of a pre-trained model; bad for training, feature work, or tabular ML; can't leverage the Python data ecosystem or hire help.
- **Full backend rewrite to Python/FastAPI** — ML is one feature, not the product core; rewriting throws away the NestJS orchestration fit.

**Guardrail:** Do NOT build any ML pipeline until the weighted rules-based score has been validated as insufficient. Premature ML is a classic ABM failure.

---

## ADR-014: Enrichment is the first paid line item — deferred until post-validation
**Date:** 2026-06-09 · **Status:** Accepted

**Decision:** The MVP is built entirely on free tiers. Enrichment provider free tiers (e.g. Apollo) do NOT include programmatic API access — that requires a paid tier (Apollo Organization ~$119/user/mo at time of writing). Therefore: during Phases 1–2, mock/seed enrichment data to build and validate the scoring/signal logic. Only pay for live enrichment API access when a real (paying) customer needs automated enrichment.

**Why:** Nothing should block starting today. The single unavoidable paid item arrives after the engine is proven, when revenue can cover it — not before.

**Rejected:** Building a workflow on the enrichment free tier (limits shift without notice and exclude API access); paying for enrichment before the engine is validated.

**Verify-live note:** Enrichment pricing/limits change frequently (Apollo already cut free credits from ~10,000 to ~720). Re-verify Apollo Organization terms and compare API-first alternatives (Clearbit, People Data Labs) before committing budget.

---

## ADR-015: First CRM = HubSpot free tier; Salesforce via free Developer Edition later
**Date:** 2026-06-09 · **Status:** Accepted

**Decision:** Build and test the CRM Adapter against HubSpot's free CRM first (free API access, rate-limited ~100 calls/10s — sufficient for MVP). Build/test the future Salesforce adapter against a free, non-expiring Developer Edition org (~15,000 API calls/day).

**Why:** Both CRMs are free for development. HubSpot's free tier includes the API access we need (we read/write data, not use their paid automation features). This costs us nothing to start.

**Customer-cost note (not our cost):** Salesforce Professional edition does not include API access by default (needs a paid add-on); Enterprise/Unlimited/Developer do. Flag this for future Salesforce customers.

**Rejected:** Paying for any CRM tier to start; building both adapters at once (HubSpot first, Salesforce in Phase 4 per ADR-003/TODO).

---

## ADR-016: Auth = Supabase Auth (resolves the ADR-012 open choice)
**Date:** 2026-06-09 · **Status:** Accepted · **Supersedes the open option in ADR-012**

**Decision:** Use Supabase Auth (not Clerk).

**Why:** Supabase is already the database/RLS layer (ADR-006) and is already in use on Olive. Keeping auth in the same platform means tighter RLS integration and one fewer vendor. Clerk remains a fine alternative but adds a separate service for no decisive benefit here.

**Rejected:** Clerk (good product, but extra vendor with no edge given Supabase is already in the stack); custom auth (per ADR-012).

---

## ADR-017: Defer HubSpot OAuth — use a Service Key in the test portal for Phase 1 dev
**Date:** 2026-06-10 · **Status:** Accepted

**Decision:** Build and test the HubspotAdapter against a single HubSpot test portal using a Service Key (HubSpot's modern replacement for Private Apps) injected via `HUBSPOT_SERVICE_KEY` env var. Do NOT implement the OAuth handshake (authorize URL → callback → encrypted token in `crm_connections`) until a real customer install is imminent.

**Why:** HubSpot has restricted the "Legacy Public App" path that ABM tools historically used for OAuth — new dev accounts can't create one. The current OAuth path requires the HubSpot CLI (`hs project create`) and a Projects/GitHub deploy flow, which is heavy for solo Phase 1 work and not on the critical path to proving the engine. The HubspotAdapter's real work (HTTP calls, normalization, rate-limit, cache, write-back semantics) is identical whether the token came from OAuth or from a Service Key, so we defer the *acquisition* step without delaying the *adapter* step. When the first paying customer needs to connect, we wire OAuth then; the HTTP client already accepts a per-call token override (`opts.token`) for that swap.

**Rejected:**
- **Build OAuth now via `hs project create`** — adds CLI + Projects workflow learning + GitHub-bundle deploy on the critical path. Not needed without a real customer.
- **Use the dev-portal "Legacy Private" app** — HubSpot now hides this behind a "use Service Keys instead" prompt; Service Keys are the supported single-account path going forward.
- **Use the "MCP Auth App" type** — that's for HubSpot's MCP server / AI-assistant integration, not for general CRM access.

**Guardrail:** When OAuth lands, NEVER read `HUBSPOT_SERVICE_KEY` in any code path that handles customer requests. Service Key is a dev-only credential. Production code path must always go through `crm_connections.access_token_encrypted` → `CryptoService.decrypt()` → `opts.token` on the HTTP client.

---

## ADR-018: Supabase JWTs verified locally (HS256) + first-login auto-provisioning
**Date:** 2026-06-11 · **Status:** Accepted

**Decision:** The API verifies Supabase access tokens locally with `SUPABASE_JWT_SECRET` (HS256, `jsonwebtoken`) — no network call per request. A verified-but-unknown user is auto-provisioned: new org (named from the email domain) + `users` row as `owner`. The Phase 0 `x-org-id` header survives as a dev-only fallback, rejected when `NODE_ENV=production`.

**Why:** Local verification is fast and keeps Supabase off the request hot path. Auto-provisioning keeps onboarding self-serve — no admin step between sign-up and using the product. The dev fallback preserves seeded-data/curl workflows without ever being a production bypass.

**Rejected:**
- **Per-request token check against Supabase's API** — adds a network hop to every request.
- **Manual org provisioning** — dead end between sign-up and first use.

**Watch-out:** Supabase projects created after mid-2025 may sign tokens with asymmetric keys (ES256/JWKS) instead of the legacy HS256 secret. If verification fails on a fresh project, swap `SupabaseAuthService.verifyToken` to JWKS verification.

---

## ADR-019: Tier/fit write-back ships in Phase 1, inside the sync job
**Date:** 2026-06-11 · **Status:** Accepted

**Decision:** After scoring, the sync job writes `abm_tier` + `abm_fit_score` back to each CRM-sourced account as custom properties (created idempotently via a new `ensureCustomProperties` on the `CrmAdapter` interface). Only `abm_*` fields are ever touched (ADR-010 holds). Per-row failures are logged + counted, never abort the batch. A rubric change that drops an account's tier clears our field (empty string) — a stale tier in the CRM is worse than a blank one.

**Why:** This is the half of Playbook Step 5 ("push tier property to CRM") that was missing, and it's the moment the product becomes visible inside the customer's CRM — the core value loop closes in Phase 1 instead of waiting for the full Phase 3 write-back (signals/awareness).

**Rejected:**
- **Separate `CRM_WRITEBACK` queue now** — right shape for Phase 3 volume, premature for ~hundreds of PATCHes already rate-limited by the HTTP client; sync-job-inline keeps one progress bar.
- **Skipping null tiers** — leaves stale tiers in the CRM after rubric changes.

---

## ADR-020: Signal weights, time-decay, and awareness thresholds are explicit named constants
**Date:** 2026-06-11 · **Status:** Accepted

**Decision:** The Signal Scorer's math lives as explicit, named constants in code — not per-org config and not learned: party base weights first=10 / second=3 / third=1, multiplied by a per-type multiplier (demo_booked 6, demo_request 5, email_reply 4, pricing_page_visit 3, email_open 0.5, …); exponential time-decay with a 14-day half-life; signals older than 90 days ignored entirely. Awareness stages use explicit thresholds (selecting: demo signal ≤30d or score ≥60; considering: pricing visit ≤30d or score ≥30; engaged: any 1st-party signal ≤30d or score ≥15; aware: any signal ≤90d; else identified). The full constant set is exposed read-only via GET /api/signals/config so the UI can always explain a score.

**Why:** ADR-009 mandates weighting + decay; making the numbers named and inspectable keeps every score reproducible and explainable — the prerequisite for the ADR-011 validation gate, where exactly these defaults get tuned against real closed-won outcomes. A score nobody can explain is a score nobody will trust or act on.

**Rejected:**
- **Per-org configurable weights in v1** — tune the defaults against validation data first; per-org knobs before validation just multiply the noise.
- **ML-learned weights** — blocked by the ADR-013 guardrail until rules-based scoring is proven insufficient.

---

## ADR-021: Orchestrator ships code-complete but fires nothing by default
**Date:** 2026-06-11 · **Status:** Accepted

**Decision:** Phase 3 orchestrator code (rules engine, Slack / CRM-task / email-sequence actions, CRUD at /api/rules) ships fully built, but inert: zero rules are seeded, new rules default to `enabled: false`, every rule×account pair has a 24h cooldown, and every fired action is recorded in the `action_log` audit table. Enabling the first rule is an explicit human act, gated on the ADR-011 awareness-score validation passing.

**Why:** The validation gate is non-negotiable — an unvalidated score must not trigger outreach at customers' accounts. But the engine has to exist and be exercisable end-to-end to be tested at all. Per-rule opt-in makes the go-live moment deliberate, reviewable, and auditable, rather than an accident of deployment.

**Rejected:**
- **Global ORCHESTRATOR_ENABLED env flag** — too blunt; per-rule opt-in is auditable and lets activation roll out one rule at a time.
- **Blocking Phase 3 code entirely until the gate passes** — the engine must be testable end-to-end before the gate passes; what is gated is firing, not building.

---

## ADR-022: Paid integrations are key-gated, never faked
**Date:** 2026-06-11 · **Status:** Accepted

**Decision:** Every integration that costs money or needs external approval activates only when its credential is present, and is honest about its state otherwise: Apollo enrichment + TAM search activate via `APOLLO_API_KEY` (without it: deterministic mock enrichment, and TAM returns a clear 503 with activation instructions); LinkedIn Ads = Tier 1+2 CSV audience export until Marketing-API partner approval is granted; outreach sequences = a logged stub action until Smartlead vs Instantly is decided; SalesforceAdapter = env-credentialed (`SALESFORCE_INSTANCE_URL`/`SALESFORCE_ACCESS_TOKEN`) and marked untested until a free Developer Edition org verifies it.

**Why:** ADR-014 forbids paid line items pre-validation, but the code paths still need to exist and be exercisable. Key-gating gives a single observable switch from mock/manual to live with zero code changes, and the failure modes (503, setup instructions) tell the operator exactly what is missing instead of pretending.

**Rejected:**
- **Paying for providers pre-validation** — violates ADR-014.
- **Mocking writes to external ad/outreach platforms** — silent no-ops that look live would be worse than honest gates.

---

## Open decisions (to revisit)

- **Enrichment provider specifics:** Apollo vs Clearbit vs People Data Labs — defer until post-validation (see ADR-014); verify live pricing/API access before committing.
- **Email outreach provider:** Smartlead vs Instantly — pending evaluation (Phase 4).
- **3rd-party intent source:** Bombora vs G2 — defer to Phase 4; expensive.
- **First design-partner customer:** TBD — needed to validate Phase 1.
- **ML trigger point:** undecided by design — only revisit after Phase 2 validation shows rules-based scoring is insufficient (see ADR-013).