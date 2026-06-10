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
- [ ] Scheduled / recurring sync (BullMQ repeatable job, e.g. every 15 min) — *Phase 1 polish*

### CRM Adapter (build first — everything plugs in)
- [x] Define `CrmAdapter` interface (getAccounts, getContacts, upsertAccount, upsertContact, createTask) — *in `@abm/shared`*
- [x] Implement `HubspotAdapter` — *5/5 methods verified against live test portal*
- [ ] OAuth + token refresh handling inside adapter — *deferred per ADR-017 until first paying customer; HTTP client already accepts per-call token*
- [x] Rate-limit + cache (Redis) wrapper around CRM calls — *TokenBucket + Redis cache + 429 retry in `HubspotHttpClient`*
- [ ] Encrypt stored CRM tokens — *blocked on OAuth; `CryptoService` ready to use*

### Enrichment
- [ ] Integrate enrichment provider (Apollo/Clearbit) behind a normalized client
- [ ] Run enrichment as a BullMQ background job (never sync)
- [ ] Make enrichment jobs idempotent + retry-safe
- [ ] Cache enrichment results in Redis

### Scoring
- [ ] Store ICP rubric as config (fields + weights, editable)
- [ ] Compute fit score per account
- [ ] Assign tier (1/2/3)
- [ ] Derive initial rubric from real win/loss data

### Target Account List + Dashboard (minimal)
- [ ] Accounts table view (Next.js + Tremor) showing score + tier
- [ ] Filtering / sorting by tier and fit score
- [ ] Auth wired up (Clerk/Supabase)

**🎯 Phase 1 done when:** a customer can connect HubSpot, see their accounts enriched, scored, and tiered in a dashboard.

---

## 🟧 Phase 2 — Add the Brain (Signals + Awareness)

### Signal Scorer (1st-party only first)
- [ ] Normalized signal-event table (`org_id`-scoped)
- [ ] Ingest 1st-party signals (website visits, email opens, product usage via CRM)
- [ ] Implement signal **weighting** (1st-party heavy)
- [ ] Implement **time-decay** on old signals
- [ ] Output a rolling signal score per account

### Awareness Score
- [ ] Map fit + signal scores to 5-stage funnel (Identified → Selecting)
- [ ] Define explicit stage-transition thresholds
- [ ] Surface awareness stage in dashboard

### ⛔ VALIDATION GATE (must pass before Phase 3)
- [ ] Measure whether awareness stage correlates with closed-won rate
- [ ] Tune weights/thresholds against real outcomes
- [ ] **Do not start Phase 3 until this passes**

---

## 🟩 Phase 3 — Act On It (Activation)

### Orchestrator (rules engine)
- [ ] Rules as config: `if score > X AND signal = Y → action Z`
- [ ] Slack alert action (Slack API)
- [ ] CRM task creation action (via Adapter)
- [ ] Lead routing logic
- [ ] Log every triggered action (audit trail)

### CRM Write-back
- [ ] Upsert scores/signals/awareness back to CRM as custom fields (match on email/phone)
- [ ] Verify no overwrite/deletion of existing data
- [ ] Contact role mapping (Influencer / Decision Maker / Champion) written back

**🎯 Phase 3 done when:** a warm account auto-triggers a Slack alert + CRM task, and scores flow back into the customer's CRM.

---

## 🟪 Phase 4 — Scale Signals & GTM

### Expand signals
- [ ] Add 2nd-party signals (ad engagement, job changes, events)
- [ ] Add 3rd-party intent data (Bombora/G2) — *expensive, verify pricing first*
- [ ] Re-rank within tiers using 3rd-party (never redefine fit)

### Outreach & ads
- [ ] ABM ad integration (LinkedIn / HubSpot Ads API)
- [ ] Automated outreach triggers (Smartlead/Instantly API) for 1:Many
- [ ] 1:1 workflow support for Tier-1 (tasks, reminders)

### Second CRM
- [ ] Implement `SalesforceAdapter` behind the same interface

### Reporting / Final Output
- [ ] Full dashboard: accounts mapped, campaigns/tasks, stakeholder maps, signals, awareness, prioritization
- [ ] Export functionality

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
