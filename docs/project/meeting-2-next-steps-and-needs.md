# What's next & what we need from you

*Mapped to your 2026 ABM Playbook · Document 2 of 2 · Stakeholder review pack*

---

## Where we are vs. your 2026 ABM Playbook

Your 2026 ABM Playbook maps almost one-to-one onto what we built: CRM backtest → ICP model → broad TAM map → enrich + qualify → score + tier → enriched TAL → contact sourcing → CRM upload → 1st/2nd/3rd-party signal tracking → awareness score (Identified → Selecting) → lead routing → demand generation → push back to CRM → GTM flywheel → closed won → prioritization. We have the same architecture, the same stage names, and the same 5-stage awareness funnel. The pipeline runs today, but on **demo-grade data** at several inputs. Closing the gap is mostly two moves: **(a) swap demo data for the real data feeds** in your playbook (Apollo, RB2B, BuiltWith, Bombora, G2, Crossbeam, real CRM deals), and **(b) wire the execution + ad tools** for the Demand-Generation and ABM-Ads stages.

---

## Gap map: your playbook → our engines

| Playbook stage / tool | Our engine | Status | What to do |
|---|---|---|---|
| CRM backtest — Closed Won/Lost analysis | 01 ICP (learn-from-deals) | **Partial** | Wire live HubSpot deal fetch (Mode B stub today) |
| ICP Model — firmographics / technographics / signals | 01 ICP | **Partial** | Seed real ICP; add technographic depth |
| Broad TAM Map — Databases (Apollo, AI Ark, Ocean.io, Sales Nav, Store Leads) | 02 TAM Builder | **Partial** | Apollo live (capped); add the other database sources |
| Broad TAM Map — Scraping (Apify, Octoparse, Python) | 02 TAM Builder | **Missing** | CSV import works; add scraper ingestion |
| Data Enrichment + Qualification (Clay) | 03 Enrichment | **Missing** | Replace mock with real enrichment + AI qualify |
| Account Scoring (Clay, ChatGPT) → Tier 1/2/3 | 04 Scoring | **Have** | Live AI formula + tiers |
| Enriched Target Account List (TAL) | 05 TAL Manager | **Have** | Live, versioned, suppression |
| ABM Ads (HubSpot, LinkedIn) | — (new) | **Missing** | Export TAL as a matched ad audience |
| Contact Sourcing (Decision Maker / Influencer / Champion) | 06 Contact Engine | **Partial** | Wire real Apollo people-search + email verify |
| CRM Upload (Companies / Contacts / Custom Properties) | 10 CRM Sync | **Partial** | Add custom-property mapping (tier, score, role) |
| 1st-party signals (CRM, sequences, product usage, website visits, forms) | 07 Signal | **Partial** | Integrate RB2B visitor-ID; product + form webhooks |
| 2nd-party signals (Ads, partner/Crossbeam, G2 reviews, LinkedIn, warm intros) | 07 Signal | **Missing** | Add 2nd-party sources (G2, Crossbeam, LinkedIn) |
| 3rd-party signals (BuiltWith, Bombora, news, social, jobs, funding) | 07 Signal | **Partial** | Add intent + technographic + news feeds |
| Awareness Score (Identified → Aware → Interested → Considering → Selecting) | 08 Awareness | **Have** | Live — exact 5-stage match |
| Lead Routing (Custom Events, CRM Tasks, Slack) | 08 / 09 | **Partial** | Alerts live (Telegram/Slack); add CRM-task action |
| Demand Generation 1:1 (warm intros, personalized, events, manual) | 09 Orchestrator | **Partial** | Play matrix live; add channel integrations |
| Demand Generation 1:Many (email, dialer, retargeting, webinars, social, video, DMs) | 09 Orchestrator | **Missing** | Wire email / DM / ad / dialer execution |
| Push Back to CRM | 10 CRM Sync | **Partial** | Live with key; add per-workspace OAuth |
| GTM Flywheel → Closed Won | 11 GTM Flywheel | **Partial** | Close the loop back into the ICP |
| Final Output — Prioritization (accounts + tiers + maps + signals + awareness) | Whole system | **Have** | This is what the platform already outputs |

## 01. ICP Engine

**Stage we're at:** Partial — Mode A (wizard) and Mode C (CSV import) are fully live end-to-end: real queued workers, real Prisma persistence + versioning, real verify-before-publish gate, real icp.created/icp.error events. LLM is real but….

**What to build next:**
- Implement Mode B live deal fetch: replace the crm-source.ts stub with the Engine 10 integration seam (request HubSpot OAuth token via…
- Flesh out the four feedback handlers so the GTM-Flywheel loop actually closes: fold play outcomes + closed-won/lost attributes into…
- Add technographic depth to match the client's 8-stage TAM vision: the ICP technographics is a flat required/preferred/excluded list; no…
- Unify the LLM path: claude.ts still reads the legacy ICP_LLM env directly instead of the shared lib/clients/llm.ts router that analyze.ts…

**What we need from you:**
- A live HubSpot account + OAuth app credentials (and confirmation of which CRM is primary — Salesforce/Attio?) so Mode B can pull real…
- A representative CRM export (CSV) or API access with enough closed-won deals (>=5, ideally dozens) to validate the Mode B/C…
- Decision on production LLM: keep Ollama (local/tunnel) as default, or provide an ANTHROPIC_API_KEY budget for Claude Sonnet on the…
- The client's actual ICP / tiering criteria and disqualifiers (cloud-native, containers, CI/CD must-haves; legacy-only/no-DevOps exclusions)…

## 02. TAM Builder

**Stage we're at:** Partial — This is one of the most genuinely 'live' engines: it makes real Apollo API calls when APOLLO_API_KEY is present and TAM_SOURCE != 'mock'. The catch is a deliberate credit-safety cap — in build-queue.ts, when a real….

**What to build next:**
- Raise the real-Apollo default account limit beyond 25 and wire it to the spec's plan tiers (250/2,500/10,000) once a paid Apollo plan with…
- Build the missing SSE progress route /api/v1/tam/progress/:job_id so the UI shows the 'Searching -> Found X -> Queuing' live progress bar…
- Implement the spec's '2-3 overlapping searches' for wider coverage, and actually resume partial jobs from the stored per-page checkpoint…
- Handle Apollo 402 (credit-exhausted) explicitly with the plan-upgrade prompt; today only 401/403/inaccessible trigger the mock fallback

**What we need from you:**
- A paid Apollo.io plan with API access (the Professional/Organization tier that unlocks /mixed_companies/search) plus the production…
- A business decision on the per-build account-limit / Apollo credit budget per workspace (and the plan tier mapping) so we can lift the…
- If technographic TAM is in scope, accounts/keys for the client's intended tech-data providers (BuiltWith, Sumble, TheirStack, PredictLeads)…
- Confirmation of the seed-list source for the 8-stage TAM flow (export of closed-won/active/churned accounts from their HubSpot/Salesforce)…

## 03. Enrichment Engine

**Stage we're at:** Mock — Plumbing is live and tested (events, queue, DB persistence, cache TTL logic, completion gate, publish), but the two data-bearing steps are NOT real. (1) Enrichment is hardcoded mock: enrichCompany() in….

**What to build next:**
- Wire real Apollo org-enrich in enrichCompany() (Engine 02 already calls real Apollo capped at 10) with Clearbit fallback and BuiltWith for…
- Replace the rule-based judge with the Claude Haiku (or local Ollama, per project default) batch qualification — 50 accounts/call against…
- Implement spec step 7 (confidence < 0.4 -> 'review recommended', never auto-disqualify) and step 8 (5% spot-check sampling of qualified +…
- Compute the completionCheck inputs from real job state (qualification ran on every enriched account, cache rows actually written) instead…

**What we need from you:**
- Apollo.io paid plan + API key with Org Enrich access (TAM already uses Apollo capped at 10 — confirm same account/plan and quota for…
- Clearbit API key (enrichment fallback, ~$0.03/call) — or a decision to drop Clearbit and use another fallback
- BuiltWith API subscription + key (~$295/mo shared) for technographic data — or chosen alternative (Sumble / TheirStack / PredictLeads) and…
- Decision on the qualification model: Claude Haiku 4.5 (per spec, needs Anthropic API key) vs the project-default local Ollama — and the…

## 04. Scoring Engine

**Stage we're at:** Partial — The core scoring math, tiering, formula versioning, override-wins logic, persistence, completion-check gate, idempotency, API routes, and UI are all REAL and working end-to-end. Formula generation is genuinely AI-backed….

**What to build next:**
- Wire the buying_signals criterion to real Signal Engine (07) data instead of the qualified-flag 0.5 proxy, and implement…
- Add a generic evaluator path so AI-generated criteria beyond the 3 hardcoded keys actually score against ICP fields (or constrain the…
- Build the two missing LLM features: explainFormulaAdjustment (Sonnet weight-change impact preview) and analyzeOverridePatterns (Haiku) to…
- Implement the spec's true live what-if tier-distribution preview in the editor (recompute counts as sliders move, before saving) --…

**What we need from you:**
- Business decision on the scoring philosophy: keep firmographic/technographic fit-based tiers (current) vs. the client's signal-count-based…
- Confirmed default tier cutoffs and per-ICP criteria weights, or sign-off that the AI-generated formula is the source of truth
- Real buying-signal feed: which signal sources count toward score (the client lists Bombora/PredictLeads 3rd-party intent, Trigify/ClearCue…
- Technographic data source decisions/credentials (BuiltWith, Sumble, TheirStack, PredictLeads) so tech_stack scoring runs on real detected…

## 05. TAL Manager

**Stage we're at:** Live — The TAL Manager's own logic is genuinely live and deterministic (the spec mandates no LLM here): real Postgres persistence, transactional immutable versioning, working idempotency via a DB unique constraint, real….

**What to build next:**
- Make the completion check honest: have requestCrmSync (or Engine 10 via an ack event such as crm.synced) confirm the CRM write actually…
- Implement HubSpot active-list creation (Tier 1, Tier 2, All ABM auto-updating lists) — the crm_audience_sync_log already queues these but…
- Wire LinkedIn Matched Audience sync for Tier 1/2 domains (spec step 7 / client's Paid Ads stage) — currently a v2 stub with no linkedin…
- Replace the direct cross-engine reads (account_scores from Engine 04, enriched_accounts from Engine 03) with the deferred local-snapshot…

**What we need from you:**
- HubSpot Marketing Hub access (and confirmation of the plan tier) — active-list creation and Ads audiences require Marketing Hub; the…
- Decision on suppression source-of-truth: should existing-customer / closed-lost suppression be auto-derived from their CRM (deal stages,…
- LinkedIn Marketing Developer Platform approval + an ad account, if Tier 1/2 Matched Audience sync is in scope (requires LinkedIn app review)
- Business rules to confirm: the suppression window (spec says closed-lost within 6 months) and whether Tier 1 must be human-reviewed before…

## 06. Contact Engine

**Stage we're at:** Partial — The orchestration, persistence, gating, events, API surface, and CRM hand-off are real and production-shaped. What is mock or demo-grade: (1) Apollo people-search AND email-verification are mock-by-default — with no….

**What to build next:**
- Wire a real contact data provider (Apollo with a paid key, and/or Findymail/BetterContact per the client stack) and add an integration test…
- Implement the Claude Haiku 4.5 role classifier (batched, confidence>0.75 auto-assign, below flag) the spec calls for, keeping the current…
- Add the Sonnet 4.6 on-demand personalized conversation-starter for Tier-1 champions (referenced in the client's intent-based-messaging…
- Make crmPushConfirmed truthful: have the completion check await/observe Engine 10's crm.synced ack (or the contact_crm_sync_log flipping…

**What we need from you:**
- A paid Apollo plan + API key with People Search and Email Verifier access (or credentials for the client's preferred enrichment stack:…
- Decision on the LLM for role classification + conversation starters: confirm whether to use local Ollama (current project default) or a…
- HubSpot connection for the target workspace (OAuth or HUBSPOT_SERVICE_KEY) and confirmation that the abm_stakeholder_role custom contact…
- Business rules for buying-committee composition: which titles/seniorities map to Decision Maker vs Champion vs End-User for their ICP, and…

## 07. Signal Engine

**Stage we're at:** Partial — The full ingest-score-dedup-store-publish pipeline is real and tested, as are page-intent scoring, HMAC webhook verification, the public snippet, decayed scoring, and the verify-before-publish gate. The critical gap is….

**What to build next:**
- Replace the random-hash mock RB2B with real visitor de-anonymisation (RB2B or Clearbit Reveal IP->company), with Clearbit as fallback —…
- Build a scheduled/always-on poller (BullMQ repeatable job or cron) to run research and 3rd-party polls daily across the TAL, instead of…
- Add PredictLeads (hiring) and Crunchbase (funding) as first-class polled sources, and wire the signal_sources table to per-workspace source…
- Add social-listening intent (Trigify/ClearCue: category terms, competitor mentions, post engagement) and 3rd-party intent (Bombora) as new…

**What we need from you:**
- RB2B account + API key (or Clearbit Reveal key) for real website-visitor identification — without this, anonymous web traffic cannot be…
- Production webhook signing secrets and confirmed webhook setup: HUBSPOT_WEBHOOK_SECRET and OUTREACH_WEBHOOK_SECRET, plus which…
- Decision + budget on 3rd-party intent/research providers: Firecrawl, TheirStack, PredictLeads, Crunchbase, Bombora API keys (each has…
- Social-listening tooling decision (Trigify/ClearCue) and access, if social signals are in scope for v1

## 08. Awareness Engine

**Stage we're at:** Live — The scoring/decay/staging/routing math and event flow are genuinely LIVE and deterministic — no mocks in this engine's core path, and it is fully wired into the real event bus (catalog confirms signal.received ->….

**What to build next:**
- Implement the missing on-demand account narrative (Claude Sonnet 4.6 / local Ollama per project default) that summarizes an account's…
- Make signal-strength tiering explicit to match the client's Tier1/2/3 model: surface distinct-signal COUNT (3+/2/1) alongside the…
- Move off the cross-engine read of the signals table to an event-sourced local copy (incremental score updates) to comply with architecture…
- Surface last_event_processed_at in the health check (from awareness_scores.last_calculated_at) instead of hardcoded null

**What we need from you:**
- The actual tiering rubric: confirm whether Tier 1/2/3 should be driven by distinct-signal COUNT (their 3+/2/1 model) or by our decayed…
- The routing/escalation playbook: which signal scores or stages should trigger which action (Slack alert vs CRM task vs sequence…
- Per-signal point values and decay rates (e.g. funding vs pricing-page-view vs G2-intent) — these live in Signal Engine 07 config but the…
- LLM decision + access for the account-narrative feature: confirm Ollama (project default) vs Claude/GPT, and approve the model, since the…

## 09. Demand Gen Orchestrator

**Stage we're at:** Partial — The orchestration brain is real and DB-backed: play matrix, atomic advisory-lock suppression (cooldown/cap/not-interested/snooze), idempotent logging, outcomes, snooze, and the completion gate all execute against….

**What to build next:**
- Wire a real channel sender: replace mockSlackTs() with an actual Slack (or keep Telegram as the canonical channel but make the completion…
- Implement real Tier 2/3 sequence enrolment against HeyReach (LinkedIn) and Instantly (email) - today fireTier23Play resolves the mapping…
- Add intent-rich drafting: feed the actual dominant_signal_type / top_recent_signals from account.hot into generateAiDraft (currently only…
- Build the reply -> sentiment -> route loop (Kondo/Clay-style): capture replies, run sentiment, branch to SDR-callback / objection /…

**What we need from you:**
- Slack workspace + app (bot token, channel) if Slack is the intended rep channel - or confirm Telegram is the canonical alert channel for…
- HeyReach account + API key for LinkedIn DM sequences and Instantly account + API key for email sequences (Tier 2/3 enrolment targets)
- Business decision on the play matrix per tier x stage: which play, which channel, cooldown days, and monthly cap per workspace (defaults…
- Decision on LLM for outreach copy: keep local Ollama (current default) or provide an Anthropic/OpenAI key for higher-quality drafts, and…

## 10. CRM Sync Engine

**Stage we're at:** Partial — This is the most production-ready engine of the 11 — the only one that writes to a real external system. The HubSpot write/read path is genuinely LIVE when HUBSPOT_SERVICE_KEY (a private-app token) is set (it is a….

**What to build next:**
- Implement real HubSpot OAuth: consent-screen redirect in GET /api/v1/oauth/hubspot and code-for-token exchange in the callback, persisting…
- Add token auto-refresh-on-401/expiry in resolveAccessToken (refresh token is stored/encrypted but never used) and the…
- Auto-create HubSpot webhook subscriptions (populate webhook_subscriptions) instead of requiring manual registration; subscribe to…
- Add a Salesforce adapter (and the Zapier inbound app) behind the existing CrmAdapter interface to support the client's Salesforce/Attio…

**What we need from you:**
- HubSpot credentials: either a Private App token (HUBSPOT_SERVICE_KEY) per portal, or — for real per-workspace OAuth — a HubSpot OAuth app…
- HUBSPOT_WEBHOOK_SECRET and the ability to register a webhook subscription in their HubSpot portal pointing at…
- Decision + list of the custom CRM properties they want ABM data written into (e.g. abm_tier, abm_awareness_score, abm_stakeholder_role) and…
- Confirmation of which CRM(s) are in scope — HubSpot only, or also Salesforce/Attio — to prioritize building additional adapters

## 11. GTM Flywheel

**Stage we're at:** Partial — LIVE: the closed-won/closed-lost path is real and DB-backed — attribution walk-back, idempotent win/loss recording, tier metrics, the ≥20-deal correlation suppression gate, the advisory-lock+watermark every-5th-win….

**What to build next:**
- Implement the LLM layer: wire lib/clients/llm.ts (Ollama default per project memory; Sonnet/Haiku optional) for (a) ICP-refresh analysis…
- Flesh out the 6 stub handlers so the Flywheel records its own attribution touches (account.hot, play.fired, play.outcome_recorded,…
- Replace the frequency-count 'correlation' with a real win-vs-loss correlation and actual signal-combination stacking (use the…
- Build the weekly Monday digest + Resend integration and the anti-ICP exclusion approve/dismiss suggestion cards (currently neither exists)

**What we need from you:**
- Resend account + API key (and a verified sending domain) for the weekly metrics digest email
- Decision on the LLM provider/budget for the four reasoning tasks — confirm local Ollama is acceptable for ICP-refresh/correlation/loss…
- Closed-won/lost deal data flowing from a real CRM: confirmed HubSpot deal-stage webhook configured with the service key; if…
- Business rules: the won/lost stage definitions per CRM, the deal-amount field to attribute, and confirmation that the 5-win ICP-refresh…

---

## Roadmap

**Phase 1 — make it real**
- RB2B / Clearbit visitor de-anonymisation → real 1st-party signals (07)
- Replace the Enrichment mock with real enrichment + AI qualification (03)
- Live HubSpot deal fetch + OAuth → real CRM backtest and push-back (01, 10)
- Lift the Apollo volume cap on a paid plan (02)

**Phase 2 — signals + outreach**
- 2nd / 3rd-party signal feeds: G2, Crossbeam, BuiltWith, Bombora, PredictLeads (07)
- Demand Generation 1:Many execution: email, DM, dialer, retargeting (09)
- Lead routing: CRM-task + custom-event actions beyond alerts (08/09)
- ABM Ads — export the TAL as a LinkedIn / HubSpot matched audience

**Phase 3 — expand + close the loop**
- More TAM sources: AI Ark, Ocean.io, Sales Navigator, Store Leads, scraping (02)
- Technographic depth + maturity gate (02 / 03 / 04)
- Flywheel intelligence: real correlation, attribution, weekly digest (11)
- Demand Generation 1:1 channels: warm intros, events, personalised outreach (09)

---

## What we need from you: consolidated checklist

### API keys & accounts
- [ ] Apollo.io paid plan + API key — TAM, enrichment, contacts (02, 03, 06)
- [ ] RB2B / Clearbit Reveal key — website visitor de-anonymisation, 1st-party signals (07)
- [ ] HubSpot OAuth app (or Private App token) + webhook secret — backtest, upload, push-back (01, 10)
- [ ] BuiltWith / Bombora / PredictLeads keys — technographic + 3rd-party intent (07)
- [ ] G2 + Crossbeam access — review intent + partner/warm-intro signals (07)
- [ ] AI Ark / Ocean.io / Sales Navigator / Store Leads — extra TAM databases (02)
- [ ] Apify / Octoparse — scraping sources for TAM (02)
- [ ] Email / dialer / ad / webinar tools — Demand Generation 1:Many execution (09)
- [ ] Anthropic key + budget — or confirm staying on local Ollama (01, 03, 04, 08, 09, 11)

### Business decisions
- [ ] Tiering model + exact thresholds and stage boundaries (04, 07, 08)
- [ ] Primary CRM: HubSpot only, or also Salesforce? (01, 05, 10)
- [ ] Contact roles: which titles → Decision Maker / Influencer / Champion + per-tier caps (06)
- [ ] Which Demand-Gen channels are in scope for v1 (1:1 vs 1:Many) (09)
- [ ] Per-signal point values + decay rates; suppression / closed-lost window (07, 05)
- [ ] ABM Ads in scope? which platforms (LinkedIn, HubSpot)

### Sample data
- [ ] CRM export of closed-won / closed-lost deals (20+) — ICP backtest + flywheel (01, 11)
- [ ] Closed-won / active / churned account export — seed the TAM (02)
- [ ] Your real ICP criteria + disqualifiers (firmographic + technographic) (01, 03, 04)
- [ ] High-intent URLs on your site (pricing, demo, ROI, comparison) (07)
- [ ] HubSpot deal pipeline stage names/ids + deal-amount field (10, 11)
