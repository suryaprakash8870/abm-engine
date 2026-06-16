# Build Plan

> The phased execution plan. One engine (or pair) per phase, in dependency order. Each phase ends with a shippable, testable increment.

## Principle

Build in dependency order. Each engine depends on the one before it. Ship a working, valuable increment at the end of each phase. The first five engines (01–05) form a complete, sellable product on their own.

## Phase map

| Phase | Weeks | Engine(s) | Outcome |
|---|---|---|---|
| 0 | 1–2 | Foundation | App skeleton: auth, multi-tenancy, event bus, CI/CD |
| 1 | 3–4 | 01 ICP Engine | Any user can create an ICP (all 3 modes) |
| 2 | 5–6 | 02 + 03 TAM + Enrichment | ICP → enriched, qualified account list |
| 3 | 7–8 | 04 + 05 Scoring + TAL | Tiered list synced to HubSpot. **First revenue.** |
| 4 | 9–10 | 06 Contact Engine | Buying committees mapped in CRM |
| 5 | 11–12 | 07 Signal Engine | Live signal tracking. **Daily active usage.** |
| 6 | 13–14 | 08 Awareness Engine | Accounts scored + staged in real time |
| 7 | 15–16 | 09 Orchestrator | Plays fire automatically. Slack + CRM tasks. |
| 8 | 17–18 | 10 CRM Sync | Centralised, reliable CRM write-back |
| 9 | 19–20 | 11 GTM Flywheel | Attribution + ICP learning loop |

## Phase 0 — Foundation (Weeks 1–2)

**Goal:** A working app skeleton every engine slots into. Do not cut corners here.

- [ ] Next.js 14 + TypeScript strict, deployed to Vercel
- [ ] Supabase project: Postgres + Auth
- [ ] Prisma schema scaffold + first migration
- [ ] Multi-tenancy: workspaces, workspace_members, RLS policies
- [ ] Auth: email/password + Google OAuth
- [ ] Event bus: BullMQ + Upstash Redis, with a test producer + consumer
- [ ] CI/CD: GitHub Actions → Vercel preview deploys on PRs
- [ ] Sentry + PostHog configured
- [ ] App shell UI: sidebar nav, layout, toast system

**Done when:** a user can sign up, get a workspace, log in/out; a test event publishes and is consumed; the app is on a production URL.

## Phase 1 — ICP Engine (Weeks 3–4)

**Goal:** Any user creates a meaningful ICP regardless of data they have.

See `docs/engines/engine-01-icp-engine.md` for the full spec. Key deliverables: 12-question wizard (Mode A), Claude synthesis, HubSpot OAuth + Mode B analysis, CSV import + field mapper (Mode C), ICP review UI, `icp.created` event.

**Done when:** a no-data user creates an ICP in <15 min; a HubSpot user gets an AI ICP from their deals; `icp.created` confirmed on the bus.

## Phase 2 — TAM Builder + Enrichment (Weeks 5–6)

**Goal:** ICP → enriched, AI-qualified account list. First complete pipeline.

See engine docs 02 and 03. Build together — tightly coupled. Key deliverables: Apollo search, enrichment waterfall (Apollo → Clearbit → cache), BuiltWith, Haiku batch qualification, SSE progress, account list UI.

**Done when:** a user triggers a build and gets a qualified, enriched list in <20 min.

## Phase 3 — Scoring + TAL Manager (Weeks 7–8)

**Goal:** Accounts scored, tiered, pushed to HubSpot. First time users see data in their CRM.

See engine docs 04 and 05. Key deliverables: AI formula generation, formula editor, tier assignment + review mode, score breakdowns, HubSpot property write, TAL versioning, suppression, CSV export, Stripe billing.

**Done when:** Tier 1/2/3 breakdown appears in HubSpot; first $299 payment processed.

## Phase 4 — Contact Engine (Weeks 9–10)

**Goal:** Tier 1 accounts have a mapped buying committee in the CRM.

See engine doc 06. Key deliverables: Apollo people search, AI role assignment, email verification, stakeholder map UI, HubSpot contact push.

**Done when:** each Tier 1 account has verified, role-assigned contacts in HubSpot.

## Phase 5 — Signal Engine (Weeks 11–12)

**Goal:** Signal tracking goes live — the activation event that drives daily usage.

See engine doc 07. Key deliverables: JS snippet, RB2B identification, HubSpot + Outreach webhooks, signal normalisation, dedup cache, `signal.received` event.

**Done when:** a website visit from a target account appears in the feed within 60 seconds.

## Phase 6 — Awareness Engine (Weeks 13–14)

**Goal:** Signals become scores; accounts advance through stages.

See engine doc 08. Key deliverables: decay scoring, daily decay job, stage machine, routing rule evaluator, hot accounts feed, trend charts.

**Done when:** a Tier 1 account's score updates in real time; `account.stage_changed` fires on threshold cross.

## Phase 7 — Orchestrator (Weeks 15–16)

**Goal:** Intelligence becomes action.

See engine doc 09. Key deliverables: routing executor, Slack notifications with buttons, HubSpot task creation, suppression logic, outcome logging, Claude account narratives, AI email drafts (v1.1).

**Done when:** a Tier 1 account crossing Considering fires a Slack alert + CRM task within 30 seconds.

## Phase 8 — CRM Sync (Weeks 17–18)

**Goal:** Centralised, reliable, auditable CRM write-back.

See engine doc 10. Key deliverables: batch write queue, rate limiter, token refresh + encryption, dead-letter queue, sync log UI, inbound deal webhooks → `crm.deal_closed_won/lost`.

**Done when:** all engines' CRM writes route through Engine 10; sync log shows all operations.

## Phase 9 — GTM Flywheel (Weeks 19–20)

**Goal:** The system starts learning. Each deal makes the ICP smarter.

See engine doc 11. Key deliverables: attribution model, pipeline-by-tier dashboard, win-rate analysis, signal correlation, ICP refresh trigger, weekly digest.

**Done when:** pipeline dashboard shows real data; first ICP refresh triggered by closed-won deals.

## After Phase 9 — integration testing

Run a full end-to-end test: ICP → TAM → enrich → score → TAL → contacts → signals → awareness → play → CRM sync → flywheel. Fix event contract mismatches here, not inside individual engines.

## Weekly cadence

- **Monday:** plan the week, clear blockers
- **Wednesday:** mid-week check — on track?
- **Friday:** demo what shipped, update `todo.md` and this plan
