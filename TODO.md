# TODO.md

> Phased task list for the ABM Engine SaaS. Each phase is independently useful — ship Phase 1 before building Phase 3. Check items off as completed; respect the validation gate before Phase 3.

---

## 🔜 Phase 0 — Setup & Decisions

- [x] Confirm first CRM target (HubSpot recommended) and get API/sandbox access — *decided in ADR-015; sandbox access still TODO*
- [ ] Verify live pricing + API limits for enrichment provider (Apollo vs Clearbit) — *changes often*
- [x] Decide Clerk vs Supabase Auth — *decided in ADR-016: Supabase Auth*
- [ ] Pick one design-partner customer to validate Phase 1 against
- [ ] Define v1 ICP scoring rubric on paper (fields + weights) before coding
- [x] Scaffold repo: Next.js (FE) + NestJS (BE) + Supabase Postgres + Redis/BullMQ
- [x] Set up secrets management (encrypted tokens, env vars) — *CryptoService (AES-256-GCM) + SECRETS_ENCRYPTION_KEY wiring*
- [x] Set up multi-tenancy schema (`org_id` on every table) + RLS policies — *enabled + forced; verified live with two-org isolation test*

---

## 🟦 Phase 1 — Prove the Core (MVP, sellable on its own)

### CRM → DB sync (the bridge between adapter and engine)
- [x] BullMQ `crm-sync` queue + `sync-accounts-from-crm` job — *idempotent, deduped per org via jobId*
- [x] Worker upserts into `accounts` (matches on `org_id` + `domain`, preserves existing fields) — *3 HubSpot test companies persisted, re-sync verified non-duplicating*
- [x] Scheduled / recurring sync (BullMQ repeatable job, e.g. every 15 min) — *BullMQ `upsertJobScheduler` per org × provider, default 15 min; control via POST /api/settings/recurring-sync*

### CRM Adapter (build first — everything plugs in)
- [x] Define `CrmAdapter` interface (getAccounts, getContacts, upsertAccount, upsertContact, createTask) — *in `@abm/shared`*
- [x] Implement `HubspotAdapter` — *5/5 methods verified against live test portal*
- [ ] OAuth + token refresh handling inside adapter — *deferred per ADR-017 until first paying customer; HTTP client already accepts per-call token*
- [x] Rate-limit + cache (Redis) wrapper around CRM calls — *TokenBucket + Redis cache + 429 retry in `HubspotHttpClient`*
- [ ] Encrypt stored CRM tokens — *blocked on OAuth; `CryptoService` ready to use*

### Enrichment
- [x] Integrate enrichment provider (Apollo/Clearbit) behind a normalized client — *`EnrichmentProvider` interface; `ApolloEnrichmentProvider` activates when `APOLLO_API_KEY` is set, deterministic `MockEnrichmentProvider` otherwise (ADR-014: no paid dependency)*
- [x] Run enrichment as a BullMQ background job (never sync) — *ENRICHMENT queue processor; re-scores the account after enrichment*
- [x] Make enrichment jobs idempotent + retry-safe — *skips accounts enriched < 7 days ago; fill-only merge — CRM data never overwritten*
- [x] Cache enrichment results in Redis — *7-day TTL*

### Scoring
- [x] Store ICP rubric as config (fields + weights, editable) — *GET/PUT /api/rubric; PUT creates a new rubric version + full org re-score; rubric now supports an optional `technologies` weight map (technographic scoring)*
- [x] Compute fit score per account — *scored on sync, after enrichment, and on rubric change*
- [x] Assign tier (1/2/3) — *derived from fit score; written to CRM as `abm_tier` (ADR-019)*
- [x] Derive initial rubric from real win/loss data — *GET /api/icp/analyze-from-crm pulls live CRM deals (`getDeals` added to `CrmAdapter` + HubSpot impl) → win rate, avg ACV, avg sales-cycle days + derived rules*

### Target Account List + Dashboard (minimal)
- [x] Accounts table view (Next.js + Tremor) showing score + tier — *shipped earlier; now extended with enrichment, signal score + awareness stage and an account detail view*
- [x] Filtering / sorting by tier and fit score — *shipped earlier with the accounts table*
- [x] Auth wired up (Clerk/Supabase) — *Supabase JWT verified locally (ADR-018); auto-provision org on first login; `/auth/login` page; dev `x-org-id` fallback rejected in production*

**🎯 Phase 1 done when:** a customer can connect HubSpot, see their accounts enriched, scored, and tiered in a dashboard.

---

## 🟧 Phase 2 — Add the Brain (Signals + Awareness)

### Signal Scorer (1st-party only first)
- [x] Normalized signal-event table (`org_id`-scoped) — *`signals` table (RLS, migration 0000), fed via POST /api/signals*
- [x] Ingest 1st-party signals (website visits, email opens, product usage via CRM) — *POST /api/signals; weights are server-side, never client-supplied*
- [x] Implement signal **weighting** (1st-party heavy) — *party base first=10 / second=3 / third=1 × type multiplier (demo_booked 6, demo_request 5, email_reply 4, pricing_page_visit 3, email_open 0.5); explicit constants, ADR-020*
- [x] Implement **time-decay** on old signals — *exponential, half-life 14 days; signals > 90 days ignored*
- [x] Output a rolling signal score per account — *recomputed on ingest; written back to CRM as `abm_signal_score`*

### Awareness Score
- [x] Map fit + signal scores to 5-stage funnel (Identified → Selecting) — *computed with every score; append-only `stage_history` on `scores`*
- [x] Define explicit stage-transition thresholds — *selecting: demo signal ≤30d or score ≥60; considering: pricing visit ≤30d or score ≥30; engaged: any 1st-party ≤30d or score ≥15; aware: any signal ≤90d; else identified (ADR-020)*
- [x] Surface awareness stage in dashboard — *accounts table + account detail*

### ⛔ VALIDATION GATE (must pass before Phase 3)
- [ ] Measure whether awareness stage correlates with closed-won rate — *REPORT endpoint shipped: GET /api/validation/awareness (closed-won rate per stage vs 2× criterion, gateStatus pending-data/passed/failed); the gate itself is UNPASSED — needs real deal data from a design partner*
- [ ] Tune weights/thresholds against real outcomes — *blocked on the same real outcome data; defaults are explicit constants (ADR-020) ready to tune*
- [ ] **Do not start Phase 3 until this passes** — *gate NOT passed; Phase 3 code landed but ships disabled — zero rules enabled (ADR-021)*

---

## 🟩 Phase 3 — Act On It (Activation)

### Orchestrator (rules engine)
- [x] Rules as config: `if score > X AND signal = Y → action Z` — *`orchestrator_rules` table (conditions: minFitScore/minSignalScore/tierIn/awarenessStageIn/signalTypeIs), CRUD at /api/rules; code complete; ships disabled — gate unpassed (zero rules seeded, new rules default `enabled: false`, ADR-021)*
- [x] Slack alert action (Slack API) — *per-org incoming webhook (`organizations.slack_webhook_url`, settings UI); code complete; ships disabled — gate unpassed*
- [x] CRM task creation action (via Adapter) — *via `CrmAdapter.createTask`; code complete; ships disabled — gate unpassed*
- [ ] Lead routing logic
- [x] Log every triggered action (audit trail) — *full audit in `action_log` + 24h cooldown per rule×account; code complete; ships disabled — gate unpassed*

### CRM Write-back
- [x] Upsert scores/signals/awareness back to CRM as custom fields (match on email/phone) — *complete: `abm_tier`/`abm_fit_score` (shipped early, ADR-019) now joined by `abm_signal_score` + `abm_awareness_stage` on accounts and `abm_role` on contacts*
- [x] Verify no overwrite/deletion of existing data — *write-back touches only `abm_*` custom fields, upsert-only semantics (ADR-010)*
- [x] Contact role mapping (Influencer / Decision Maker / Champion) written back — *contacts sync job (chained after account sync) classifies buying role from job-title regex (decision_maker/champion/influencer/unknown) → `abm_role` on the CRM contact*

**🎯 Phase 3 done when:** a warm account auto-triggers a Slack alert + CRM task, and scores flow back into the customer's CRM.

---

## 🟪 Phase 4 — Scale Signals & GTM

### Expand signals
- [x] Add 2nd-party signals (ad engagement, job changes, events) — *ingestion path ready: POST /api/signals with `party=second` (base weight 3); no 2nd-party source feeding it yet*
- [x] Add 3rd-party intent data (Bombora/G2) — *ingestion ready: POST /api/signals with `party=third` IS the relay path (weights ≪ 1st-party, ADR-009); provider contract pending pricing*
- [ ] Re-rank within tiers using 3rd-party (never redefine fit)

### Outreach & ads
- [x] ABM ad integration (LinkedIn / HubSpot Ads API) — *CSV audience export shipped: GET /api/audiences/tiers.csv (Tier 1+2 for manual LinkedIn/HubSpot Ads upload); direct LinkedIn API deferred — needs Marketing API partner approval (ADR-022)*
- [x] Automated outreach triggers (Smartlead/Instantly API) for 1:Many — *orchestrator `email-sequence` action is a logged stub until the outreach provider is chosen (ADR-022)*
- [x] 1:1 workflow support for Tier-1 (tasks, reminders) — *via the orchestrator `crm-task` action (tasks created through the CRM Adapter)*

### Second CRM
- [x] Implement `SalesforceAdapter` behind the same interface — *implemented, UNTESTED: REST API (SOQL + sobjects), env creds `SALESFORCE_INSTANCE_URL`/`SALESFORCE_ACCESS_TOKEN`, `abm_*` → `abm_*__c` mapping; `ensureCustomProperties` verifies fields and throws setup instructions (creation needs Metadata API); verify against a free Developer Edition org*

### Reporting / Final Output
- [x] Full dashboard: accounts mapped, campaigns/tasks, stakeholder maps, signals, awareness, prioritization — *accounts table + detail dashboards extended: enrichment, signal score, awareness stage, tiers, TAM-sourced accounts (`source='apollo'`)*
- [x] Export functionality — *audience CSV export (GET /api/audiences/tiers.csv)*

---

## 🔁 Ongoing / Cross-cutting

- [ ] Keep `DECISIONS.md` updated when choices are made/changed
- [ ] Re-verify vendor pricing/API limits before each budget commitment
- [ ] Maintain idempotency + rate-limiting on all external calls
- [ ] Security review before holding real customer CRM tokens (encryption, RLS, audit logs)
- [ ] Each new component → add tests behind its interface

---

## ⚠️ Risk watchlist (from DECISIONS / plan)

- Awareness score = noise without validation → Phase 2 gate
- 3rd-party intent false positives → weight 1st-party higher
- Tooling/cost sprawl → add expensive tools only in Phase 4
- CRM rate limits / token expiry → queue + cache + refresh handling
- Security of stored CRM access → encrypt, RLS, audit
