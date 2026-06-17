# Todo

> Granular task tracker. `[ ]` not started · `[~]` in progress · `[x]` done · `[!]` blocked.
> Keep this in sync as work happens. Each engine's tasks come from its doc in `docs/engines/`.

---

## Phase 0 — Foundation

### Infrastructure
- [ ] Init Next.js 14 + TypeScript strict
- [ ] Tailwind + shadcn/ui setup
- [ ] Supabase project (Postgres + Auth)
- [ ] Prisma scaffold + first migration
- [ ] Upstash Redis + BullMQ test job
- [ ] Vercel project + env vars
- [ ] GitHub Actions CI/CD → Vercel preview deploys
- [ ] Sentry configured
- [ ] PostHog configured
- [ ] Resend configured

### Auth + multi-tenancy
- [ ] Email/password signup + login
- [ ] Google OAuth
- [ ] Workspace creation on signup
- [ ] workspace_members table + roles (owner/admin/member)
- [ ] RLS policies on all tables
- [ ] JWT workspace_id claim in API routes
- [ ] Workspace invite flow

### App shell
- [ ] Sidebar navigation
- [ ] Layout + responsive shell
- [ ] Toast notifications
- [ ] Loading + error boundaries

### Event bus
- [ ] Event publisher utility (`lib/events/publish.ts`)
- [ ] Event consumer base (`lib/events/consume.ts`)
- [ ] Correlation ID generation + propagation
- [ ] Dead-letter queue setup
- [ ] Event schema types (shared `lib/events/types.ts`)

---

## Phase 1 — Engine 01 ICP Engine
- [ ] Prisma models (icp_definitions, icp_versions, wizard_sessions, crm_analysis_jobs, icp_confidence_history)
- [ ] 12-question wizard UI
- [ ] Claude Sonnet ICP synthesis (Mode A)
- [ ] Industry template library (6 templates)
- [ ] "Seed from domain" shortcut
- [ ] HubSpot OAuth flow
- [ ] Mode B CRM statistical analysis
- [ ] CSV upload + field mapper (Mode C)
- [ ] ICP review/edit UI with confidence bars
- [ ] `icp.created` publisher
- [ ] Integration test (input → icp.created)
- [ ] Health check endpoint

---

## Phase 2 — Engines 02 + 03

### Engine 02 TAM Builder
- [ ] Prisma models (tam_build_jobs, apollo_search_results, raw_account_list, search_params_log)
- [ ] Apollo client (`lib/clients/apollo.ts`)
- [ ] ICP → Apollo filter mapping
- [ ] Company search + pagination
- [ ] Deduplication by domain
- [ ] User CSV upload merge
- [ ] SSE progress endpoint
- [ ] `tam.search_completed` publisher
- [ ] Integration test
- [ ] Health check

### Engine 03 Enrichment
- [ ] Prisma models (enrichment_jobs, enriched_accounts, qualification_results, prompt_versions, enrichment_cache)
- [ ] Enrichment cache check-before-call logic
- [ ] Apollo enrich integration
- [ ] Clearbit fallback client
- [ ] BuiltWith client
- [ ] Claude Haiku batch qualification (50/call)
- [ ] Spot-check sampling (5%)
- [ ] Account list UI with filters
- [ ] Disqualified accounts review UI
- [ ] `accounts.enriched` publisher
- [ ] Integration test
- [ ] Health check

---

## Phase 3 — Engines 04 + 05

### Engine 04 Scoring
- [x] Prisma models (scoring_formulas, scoring_formula_versions, account_scores, score_history, tier_overrides)
- [x] Claude Sonnet formula generation (tool-call forced JSON, weight-normalised, equal-weight fallback)
- [x] Scoring calculation engine (per-criterion 1/0.5/0 weighted sum)
- [x] Formula editor UI (weight sliders + tier distribution)
- [x] Tier assignment + cutoffs (tier3_min floor now honoured — below it = untiered/null, not Tier 3)
- [x] Score breakdown view (scored-accounts table + override modal)
- [x] `accounts.scored` publisher (fixed: completion gate was permanently locked → always reported failed)
- [~] Tier 1 review mode — manual override exists; dedicated review view TBD
- [x] Integration test (42/42 pass) + health check ([index.ts](../../lib/engines/scoring-engine/index.ts) health())
- Audit (2026-06-17): 7-dimension multi-agent review → 17 confirmed findings.
  - Batch 1 (code-only) shipped: completion-gate showstopper, wrong-ICP load, formula validation, recordTierBoundaries verify, job dedup, UI type + bad prisma import.
  - Batch 2 (migration 20260617120000) shipped: nullable tier for tier3_min, QualificationResult.workspace_id (+ Engine 03 write/read scoping).
  - Deferred: cross-engine snapshot refactor (rule #1) — currently functionally safe; do during microservice split.
  - VERIFIED end-to-end: scored "Cobalt AI" → 65 → Tier 2, accounts.scored published once, no retries.
- Known downstream bug (Engine 05 stub): tal-manager publishes tal.finalized with empty tal_id → dead-letters in contact/crm engines. Fix when building Engine 05.

### Engine 05 TAL Manager
- [x] Prisma models (target_account_lists, tal_accounts, tal_versions, suppression_list, crm_audience_sync_log) — workspace_id on ALL 5 (migration 20260617110327)
- [x] Suppression rule engine (domain + accountId match, active/expired-aware)
- [x] TAL versioning (immutable tal_versions snapshot per finalize; idempotent on correlation_id)
- [~] HubSpot active list creation — requests recorded in crm_audience_sync_log ('queued'); actual write delegated to Engine 10 via tal.finalized
- [x] CSV export (GET /api/v1/tal/export)
- [x] `tal.finalized` publisher (real tal_id + verify-before-publish; fixed the empty-tal_id dead-letter the stub produced)
- [x] Integration test (3 tests incl. fail-closed gating) + health check (GET /api/v1/tal-manager/health)
- [x] API routes: GET /tal, GET /tal/versions, POST /tal/suppress, POST /tal/finalize, GET /tal/export
- [x] UI: /tal accounts table (tier filter, suppress modal, export, re-finalize)
- VERIFIED end-to-end: finalized TAL v1 (Cobalt AI, Tier 2), tal.finalized consumed cleanly by contact + crm-sync engines, 0 dead-letters.
- Audit (2026-06-17): 6-dimension multi-agent review → 13 findings; 1 "critical" was a FALSE POSITIVE (the enriched join works — proven live). Fixed: atomic version transaction (migration 20260617130000 adds unique[workspace_id, source_correlation_id]), workspaceId on all deletes, tier-validity filter (no `?? 3`), CRM-sync skip on idempotent reuse, empty-vs-undefined account_ids. Re-verified: re-finalize cut v2 atomically (1→2, no gap).

### Billing (Stripe)
- [ ] Stripe products + prices
- [ ] Checkout session
- [ ] Customer Portal
- [ ] Subscription webhook handler
- [ ] Plan enforcement middleware
- [ ] Account limit enforcement

---

## Phase 4 — Engine 06 Contact Engine
- [ ] Prisma models (contacts, stakeholder_maps, email_verification_results, contact_crm_sync_log, sourcing_jobs)
- [ ] Apollo people search
- [ ] Email verification
- [ ] Claude Haiku role assignment
- [ ] Duplicate detection vs CRM
- [ ] Stakeholder map UI
- [ ] HubSpot contact push
- [ ] `contacts.mapped` publisher
- [ ] Integration test + health check

---

## Phase 5 — Engine 07 Signal Engine
- [ ] Prisma models (signals, signal_sources, webhook_log, tracking_tokens, visitor_sessions)
- [ ] JS tracking snippet (`public/tracker.js`)
- [ ] Signal intake endpoint
- [ ] RB2B client + IP identification
- [ ] Clearbit Reveal fallback
- [ ] High-intent page detection
- [ ] HubSpot webhook handler + signature verify
- [ ] Outreach webhook handler
- [ ] Signal normaliser
- [ ] Dedup cache (Redis, 5-min window)
- [ ] Snippet install UI + test button
- [ ] `signal.received` publisher
- [ ] Integration test + health check

---

## Phase 6 — Engine 08 Awareness Engine
- [ ] Prisma models (awareness_scores, score_snapshots, routing_rules, routing_rule_evaluations, stage_change_log)
- [ ] Score calculation with decay
- [ ] Daily decay job (BullMQ scheduled)
- [ ] Stage assignment + change detection
- [ ] Routing rule evaluator
- [ ] Hot accounts feed UI
- [ ] Score trend charts
- [ ] `account.score_updated`, `account.stage_changed`, `account.hot` publishers
- [ ] Integration test + health check

---

## Phase 7 — Engine 09 Orchestrator
- [ ] Prisma models (plays_log, play_templates, play_outcomes, suppression_rules, sequence_mappings, ai_draft_log)
- [ ] Routing rules executor
- [ ] Play matrix logic
- [ ] Suppression check (atomic)
- [ ] Slack OAuth app + notification cards
- [ ] Slack interactive button handlers
- [ ] HubSpot task creation
- [ ] Claude Sonnet account narrative
- [ ] AI email draft generation (v1.1)
- [ ] Play queue UI
- [ ] `play.fired`, `play.outcome_recorded` publishers
- [ ] Integration test + health check

---

## Phase 8 — Engine 10 CRM Sync
- [ ] Prisma models (crm_connections, sync_jobs, sync_log, field_mappings, webhook_subscriptions)
- [ ] Batch write queue
- [ ] Rate limiter (token bucket, 8 req/sec)
- [ ] OAuth token refresh + AES-256 encryption
- [ ] HubSpot batch write
- [ ] Inbound deal webhook → closed_won/lost events
- [ ] Dead-letter queue + retry
- [ ] Auto-create missing properties
- [ ] Sync log UI
- [ ] `crm.synced`, `crm.deal_closed_won/lost` publishers
- [ ] Integration test + health check

---

## Phase 9 — Engine 11 GTM Flywheel
- [ ] Prisma models (pipeline_snapshots, attribution_events, win_loss_analysis, flywheel_metrics, signal_correlation_data)
- [ ] Attribution model (walk back signal timeline)
- [ ] Pipeline-by-tier calculation
- [ ] Win rate by tier
- [ ] Signal correlation analysis (min 20 deals)
- [ ] ICP refresh trigger (every 5th closed-won)
- [ ] Claude Sonnet ICP refresh analysis
- [ ] Weekly digest email
- [ ] Reporting/Insights UI
- [ ] `flywheel.metrics_updated`, `icp.refresh_recommended` publishers
- [ ] Integration test + health check

---

## Cross-cutting / ongoing
- [ ] API rate limiting per workspace
- [ ] Structured request logging
- [ ] Enrichment cost tracking per workspace
- [ ] GDPR data deletion endpoint
- [ ] Privacy + cookie policy pages
- [ ] Getting-started docs
- [ ] In-app onboarding tooltips
- [ ] Onboarding email sequence (Resend)
- [ ] Internal admin dashboard
- [ ] Security review before public launch
- [ ] Full end-to-end integration test (all 11 engines)
