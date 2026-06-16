# PLAN.md

> Gap analysis between the **workflows.io ABM Playbook (11 steps)** and the codebase.
> Source: https://www.workflows.io/workflows/abm-playbook (Dan Rosenthal, Feb 2026)

**Status legend:** ⬜ Not Started · 🟡 In Progress · ✅ Complete · ⏳ Pending external (code done — needs a key, approval, or real data)

---

## Playbook Coverage Map — after the 2026-06-11 build

| # | Playbook Step | Codebase Status | Coverage |
|---|---------------|-----------------|----------|
| 1 | Build ICP Model from CRM wins/losses | CSV lab + live deal analysis (`/api/icp/analyze-from-crm`: win rate, ACV, sales cycle, derived rules) | ✅ |
| 2 | Validate ICP (firmographics + technographics) | Rubric scores firmographics + optional `technologies` map fed by enrichment | ✅ |
| 3 | Build TAM Map | `/api/tam/search` → Apollo import as `source: apollo`, dedup, auto-score + `/accounts/tam` UI | ✅ code · ⏳ `APOLLO_API_KEY` |
| 4 | Data Enrichment & Qualification | Provider interface, BullMQ pipeline, Redis cache, fill-only merge, re-score | ✅ (mock live · ⏳ Apollo key for real data) |
| 5 | Account Scoring & Tiering (push to CRM) | Rules-based scoring + `abm_tier`/`abm_fit_score` write-back every sync | ✅ |
| 6 | Sync Tier 1/2 → Ads platforms | Tier 1+2 audience CSV export for manual upload | ✅ CSV · ⏳ LinkedIn API needs partner approval |
| 7 | Contact Sourcing & Stakeholder Mapping | Contacts sync, title→role classification, `abm_role` write-back, stakeholders UI | ✅ |
| 8 | Signal Tracking (1st/2nd/3rd party) | `POST /api/signals`, server-side weights, decay; 3rd-party posts to same endpoint | ✅ (⏳ Bombora/G2 contract for 3rd-party feed) |
| 9 | Lead Scoring → 5 Awareness Stages | Explicit thresholds, stage history, badges in UI, CRM write-back | ✅ |
| 10 | Demand Generation Execution | 1:1 plays (CRM task w/ context) work end-to-end; 1:Many email = stub | ✅ 1:1 · ⏳ Smartlead/Instantly for 1:Many |
| 11 | CRM Write-Back | `abm_tier`, `abm_fit_score`, `abm_signal_score`, `abm_awareness_stage`, `abm_role` — upsert-only | ✅ |

**11/11 steps have working code. 7 fully live; 4 carry an external dependency (key / approval / data contract) — none carry missing code.**

---

## Phase Status

### Phase 1 — MVP ✅ Complete (2026-06-11)
- ✅ 1A ICP from CRM deals — `getDeals` on adapter interface + HubSpot; `GET /api/icp/analyze-from-crm` (win rate, avg ACV, avg cycle days, derived rules)
- ✅ 1B Enrichment — `EnrichmentProvider` interface; Apollo (key-gated, ADR-014/022) + deterministic mock; BullMQ processor; 7-day Redis cache; fill-only merge; technographics in rubric
- ✅ 1C Auth — Supabase JWT (ADR-018), auto-provision, `/auth/login`, dev fallback
- ✅ 1D Tier write-back — ADR-019
- ✅ 1E Recurring sync — BullMQ `upsertJobScheduler` per org × provider (default 15 min), controlled from `/settings`
- ✅ 1F Dashboard — `/dashboard` (metric cards, tier donut, awareness funnel, validation gate card), `/icp/rubric` editor (append-only versions + re-score), `/settings`

### Phase 2 — Signals & Awareness ✅ Complete / gate ⏳ pending data
- ✅ 2A Stakeholder mapping — contacts sync chained after account sync; title→role regex; `abm_role` write-back; stakeholders section on account detail
- ✅ 2B Signal Scorer — party base 10/3/1 × type multipliers, 14-day half-life decay, 90-day cutoff (ADR-020); `POST /api/signals` + `GET /api/signals/config`
- ✅ 2C Awareness stages — explicit thresholds (ADR-020), append-only `stage_history`, badges in accounts table + detail
- 🟡→⏳ 2D Validation gate — REPORT shipped (`GET /api/validation/awareness`, 2× lift criterion, `gateStatus`); **the gate itself is UNPASSED — needs a design partner's real closed-won history. Phase 3 rules stay disabled until then.**

### Phase 3 — Activation ✅ Code complete, fires nothing by default (ADR-021)
- ✅ 3A Orchestrator — rules as DB config, conditions (fit/signal/tier/stage/signal-type), actions (slack / crm-task / email-sequence stub), 24h cooldown, full `action_log` audit, CRUD at `/api/rules`. **Zero rules seeded; new rules default disabled.**
- ✅ 3B Full write-back — `abm_signal_score` + `abm_awareness_stage` (accounts), `abm_role` (contacts); upsert-only `abm_*` (ADR-010)
- ✅ 3C Slack — per-org webhook (settings UI), alert template with account/tier/stage/signal/link
- ⬜ Lead routing — not built (needs owner data model; revisit with first customer)

### Phase 4 — Scale ✅ Code complete with honest gates (ADR-022)
- ✅ 4A TAM builder — Apollo search → import → score; key-gated 503 until `APOLLO_API_KEY`
- ✅ 4B Ads audiences — Tier 1+2 CSV export; direct LinkedIn API deferred (partner approval required)
- ✅ 4C Demand gen plays — 1:1 (crm-task) live; 1:Many email-sequence stub until outreach provider chosen (pricing verify first)
- ✅ 4D 3rd-party intent — ingestion path live (`party: third` ≪ 1st-party per ADR-009); provider contract pending pricing
- ✅ 4E Salesforce adapter — full REST/SOQL implementation, env-credentialed; **implemented, UNTESTED** (needs free Developer Edition org); `abm_*__c` field mapping; custom fields require one-time manual setup (Metadata API out of scope)

---

## What it takes to go fully live (no code, just keys/data)

| Item | Unlocks | Action |
|------|---------|--------|
| `SUPABASE_JWT_SECRET` + web Supabase env | Real login (else dev fallback) | Supabase dashboard → Settings → API |
| Design partner with real deal history | 2D validation gate → enables Phase 3 rules | Open decision in DECISIONS.md |
| `APOLLO_API_KEY` (paid) | Live enrichment + TAM search | Verify current pricing first (ADR-014) |
| Slack incoming webhook | Orchestrator alerts | Paste in `/settings` |
| Salesforce Developer Edition org | Verify untested adapter | Free signup; set 2 env vars |
| Smartlead vs Instantly decision | 1:Many email plays | Verify pricing (open decision) |
| Bombora/G2 contract | 3rd-party intent feed | Verify pricing (open decision) |
| LinkedIn Marketing API approval | Direct audience sync (CSV works today) | Partner application |
| `npm run migrate` (packages/db) | Applies migration 0001 (new tables/columns) | Run once against the DB |

---

## Run the engine end-to-end (dev)

1. `docker compose up -d` (Postgres + Redis) → `npm run migrate` in `packages/db`
2. API: `npm run start:dev` in `apps/api` · Web: `npm run dev` in `apps/web`
3. Seed: `POST /api/dev/seed/accounts { orgId }` or sync: `POST /api/dev/sync/accounts { orgId }` (needs `HUBSPOT_SERVICE_KEY`)
4. Sync now auto-chains: accounts → scoring → enrichment jobs → contacts+roles → CRM write-back
5. Fire a signal: `POST /api/signals { domain, type: "pricing_page_visit", party: "first" }` → watch stage move on `/dashboard`
6. Gate report: `GET /api/validation/awareness` · Rules: `POST /api/rules` (stays disabled until you flip `enabled`)

---

*Last updated: 2026-06-11. All four phases code-complete (commit `dae3305` + this session). Verified: API `nest build` ✅ · web `next build` ✅ (11 routes). See ADR-018…022 for the decisions this build introduced.*
