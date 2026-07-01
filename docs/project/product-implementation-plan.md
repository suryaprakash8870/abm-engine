# ABM Engine — Product, Architecture & Implementation Plan

> Stakeholder document for a **GTM-expert audience with solid technical literacy.**
> It assumes you know ABM, the data-tool landscape, and the GTM motion — so it skips
> the 101 and keeps the architecture, infrastructure, and unit-economics detail. The
> executive summary stays plain; everything below it is built to survive technical
> scrutiny.

---

## 1. Executive summary

ABM Engine is an **Account-Based Marketing platform** — software that helps a B2B
company stop marketing to everyone and instead focus its sales and marketing on the
specific companies most likely to buy. It takes you from *"who is our ideal
customer?"* all the way to *"here is exactly who to contact, when, and why,"* and
writes it all back into your CRM — then learns from every deal you close.

It is built as **11 independent "engines"** that each do one job and hand work to the
next over an internal message bus — like an assembly line. This makes the system
resilient (one engine failing doesn't stop the others), scalable (speed up only the
busy engine), and maintainable (teams work on different engines in parallel).

The system is **already built and deployed end-to-end** as an MVP. The pipeline runs
today; several data-sourcing steps currently use sample/demo data and become live as
the relevant third-party keys are connected. This document covers what the product
is, how it's architected and why, what each engine does, the tools and infrastructure
needed to run the full MVP, what's required to deploy it, and a realistic cost
estimate for running one full cycle on the Claude API.

**At a glance:**
- **Stack:** TypeScript · Next.js 14 · PostgreSQL + Prisma · Redis + BullMQ · local Ollama or Claude API · deployed on Render
- **Architecture:** 11 event-driven engines in one modular codebase (a "modular monolith")
- **AI cost per full cycle (~100 accounts):** roughly **$0.50–$1.50** on the Claude API with the recommended model split — or **~$0** running locally on Ollama

---

## 2. About the product

**The problem it solves.** B2B sales reps waste most of their time chasing companies
that will never buy. There's no shortage of leads — there's a shortage of *focus*.

**What it does.** ABM Engine is the "brain" that decides where to focus:
1. Defines your **Ideal Customer Profile** (ICP) — what a perfect customer looks like.
2. **Finds** every company that matches, from data providers.
3. **Enriches and qualifies** each one (size, tech, fit).
4. **Scores and tiers** them — Tier 1/2/3.
5. Finds the **buying committee** at each account (decision maker, champion, influencer).
6. Watches for **buying signals** (pricing-page visits, hiring, tech changes).
7. Scores **awareness** — how close each account is to buying (Identified → Selecting).
8. **Fires the right play** automatically — alerts a rep, drafts outreach, creates a task.
9. Writes everything **back to the CRM**.
10. **Learns** from every closed deal to sharpen the ICP — the "GTM flywheel."

**Who it's for.** B2B SaaS companies with a sales team. The buyer is typically the
**VP of Marketing or Head of RevOps.** It is, in effect, a lighter, CRM-agnostic
version of platforms like 6sense and Demandbase — and it maps almost 1:1 to the
client's own **2026 ABM Playbook.**

---

## 3. Implementation plan

The MVP exists. The plan below sequences the remaining work to take it from
"works on demo data" to "running on a real customer's real data." Phases are ordered
by dependency and value; timing depends on team size and is intentionally omitted.

### Phase 1 — Make it real (highest priority)
Swap demo data for real data feeds so the pipeline runs on a live customer.
- Integrate **RB2B / Clearbit Reveal** so website visits map to *real* companies (today this is demo-grade).
- Replace the **Enrichment** mock with real enrichment + AI qualification (Apollo/Clearbit/BuiltWith).
- Wire **live HubSpot OAuth** + the closed-deal read so the ICP can learn from real wins and the CRM push is live per-workspace.
- Lift the **Apollo** sourcing volume cap on a paid plan.

### Phase 2 — Signals & outreach execution
Turn captured signals into real outbound action.
- Add **2nd/3rd-party signal feeds**: G2, Crossbeam, BuiltWith, Bombora, PredictLeads.
- Wire **outreach execution**: HeyReach (LinkedIn DMs), Instantly (email sequences), Kondo (reply monitoring).
- Add **meeting booking** (Cal.com / Chilipiper) and the lead-routing CRM-task action.
- Add **ABM Ads** — export the TAL as a LinkedIn / HubSpot matched audience.

### Phase 3 — Expand, learn & polish
- More TAM sources (AI Ark, Ocean.io, Sales Navigator, scraping via Apify/Octoparse) + technographic depth.
- **Meeting intelligence** (Sybill / Gong).
- **Flywheel intelligence** — real correlation, attribution, a weekly digest.
- **Billing** (Stripe) and **team features** (invite flow, role enforcement) for real multi-user customers.

### Separate workstream — Content Intelligence Engine
A net-new capability (content generation: creator mining → voice analysis → AI content
per team member → publish + track). Not part of the current 11 engines; scope and
resource it on its own track once Phases 1–2 make the core pipeline trustworthy.

---

## 4. Why 11 separate engines & what architecture we use

### The architecture, in one line
ABM Engine is a **modular monolith of event-driven services**: one codebase and one
deployable image, organized into 11 engines that communicate **only through an event
bus** (BullMQ on Redis) and never read each other's database tables. It is *not*
micro-frontends, and *not yet* physically separate microservices — but the engine
boundaries are enforced in code, so any engine can later be split into its own
process without touching the others.

### How it works
```
ICP → TAM → Enrichment → Scoring → TAL → Contacts →
Signals → Awareness → Orchestrator (plays) → CRM Sync → Flywheel ↺ (back to ICP)
```
Each engine **subscribes** to the event(s) it cares about, does its one job, and
**publishes** an event for the next engine. Events carry `workspace_id`,
`correlation_id`, and `timestamp`. An engine publishes its success event **only after
a completion check passes** ("verify before publish") — a half-finished job reporting
success is worse than a failed job reporting failure.

### Why split into 11 engines instead of one big program?
| Benefit | What it means |
|---|---|
| **Fault isolation** | If the Signal engine errors, Scoring and CRM Sync keep running. One failure doesn't take down the pipeline. |
| **Independent scaling** | Signals are always-on and high-volume; ICP runs occasionally. Each engine can be scaled (or moved to its own worker) without touching the rest. |
| **Parallel ownership** | 11 engineers can build 11 engines at once — each owns its tables, API, and logic, with no merge conflicts (each engine has its own Prisma schema file). |
| **Swappable providers** | The CRM lives behind one adapter (only Engine 10 talks to HubSpot). Swapping in Salesforce later is a new adapter class, not a rewrite. |
| **Clear contracts** | Engines talk through typed events, so a change in one engine can't silently break another. |

### The honest trade-offs
- **More moving parts** — an event bus (Redis) and a worker are required, not just a web server.
- **Eventual consistency** — work flows asynchronously; a downstream engine reacts a moment after the upstream one finishes (not instantly in one transaction).
- **Operational overhead** — you monitor a worker and a queue, not just one process.

For an MVP these costs are contained: **one worker process hosts all 11 engines'
consumers** (and on the free tier it can even run inside the web process). At scale,
any engine can be peeled off into its own worker with no code change.

### Why this stack (and why each choice)
| Layer | Choice | Why |
|---|---|---|
| Language | **TypeScript (strict)** | One language front-to-back; shared types so event contracts can't drift; mistakes caught at compile time. |
| Web/API | **Next.js 14 (App Router)** | Dashboard + `/api/v1` backend in one codebase — fastest path to a deployed full-stack app. |
| Database | **PostgreSQL + Prisma** | Reliable relational storage; Prisma's multi-file schema lets each engine own its tables. Supabase adds Auth + row-level security. |
| Event bus | **BullMQ on Redis** | Already in the stack; gives pub/sub, retries, dead-letter queue, rate limiting out of the box. Kafka was overkill for MVP volumes. |
| AI | **Local Ollama (default) or Claude API** | Ollama = zero per-token cost + data stays on your hardware; Claude API for the highest-quality reasoning. One router picks the provider. |
| UI | **Tailwind + shadcn/ui** | Fast, consistent, fully controllable styling. |
| Auth | **Supabase Auth + RLS** | Tenant isolation enforced at the database, not just in app code. |

---

## 5. The 11 engines — what each one does

| # | Engine | What it does |
|---|---|---|
| 01 | **ICP Engine** | Builds the structured Ideal Customer Profile (firmographics, technographics, signals, exclusions). Three modes: a 12-question wizard, learning from CRM closed deals, or CSV import. AI-synthesised, versioned. |
| 02 | **TAM Builder** | Given a finished ICP, sources every matching company from Apollo (and other databases), dedupes by domain, and hands the raw account list to Enrichment. |
| 03 | **Enrichment Engine** | Fills in each company's firmographics + tech stack from a shared cost-control cache, then AI-qualifies whether it's genuinely a fit, with a reason. *(Currently mock — goes live with an enrichment key.)* |
| 04 | **Scoring Engine** | Gives every account a 0–100 fit score from an AI-generated, user-editable weighted formula, and assigns Tier 1/2/3. Sliders tune the weights; "Run scoring" re-tiers. |
| 05 | **TAL Manager** | Keeps the authoritative Target Account List — suppresses accounts (e.g. existing customers), snapshots immutable versions, and publishes when finalized. |
| 06 | **Contact Engine** | Sources the buying committee per Tier-1/2 account (decision maker / champion / influencer), verifies emails, and maps roles. |
| 07 | **Signal Engine** | Always-on radar: captures buying signals (website visits, CRM/email webhooks, 3rd-party research), scores and de-dupes them. *(Visitor→company mapping is demo-grade until RB2B is added.)* |
| 08 | **Awareness Engine** | Rolls signals into one time-decayed score per account and a 5-stage funnel (Identified → Aware → Interested → Considering → Selecting) — the same stages as the client's playbook. |
| 09 | **Demand-Gen Orchestrator** | Turns awareness triggers into rep action: picks the right play by tier × stage, checks suppression, fires it (Slack/Telegram alert, CRM task, drafted outreach), and records the outcome. |
| 10 | **CRM Sync Engine** | The single chokepoint for all CRM I/O. Writes tiers, contacts, scores, and tasks back to HubSpot (upsert, never overwrite), and reads closed deals back in. Only this engine touches the CRM. |
| 11 | **GTM Flywheel** | The learning loop. On every closed deal it builds multi-touch attribution, computes pipeline/win-rate by tier, and feeds insights back to sharpen the ICP — closing the loop to Engine 01. |

---

## 6. Tools & infrastructure needed for the MVP

### Infrastructure (the 5 components)
| Component | What it is | MVP option |
|---|---|---|
| **Web server** | Runs the Next.js app + API | Render (free → paid), Vercel, AWS/GCP |
| **Worker** | Runs all 11 engines' event consumers | Same host (in-web on free tier) or a dedicated process |
| **Database** | PostgreSQL — stores everything | Supabase / managed Postgres |
| **Queue** | Redis — the event bus between engines | Upstash / managed Redis (must be `noeviction`) |
| **AI/LLM** | Reasoning + classification | Local Ollama (default) or Claude API |

### Third-party tools (bring-your-own key; mock until connected)
| To do this… | Tool | Status today |
|---|---|---|
| Source companies | **Apollo**, Ocean.io, Sales Navigator | Apollo integrated (capped) |
| Identify site visitors | **RB2B**, Warmly | Needed (Phase 1) |
| Enrich + technographics | Apollo, Clearbit, **BuiltWith**, Sumble | Needed (Phase 1) |
| 3rd-party intent | **Bombora**, PredictLeads | Needed (Phase 2) |
| Review / partner signals | **G2**, Crossbeam | Needed (Phase 2) |
| Web research / scraping | **Firecrawl**, TheirStack | Integrated |
| CRM (system of record) | **HubSpot**, Salesforce | HubSpot integrated |
| Outreach | **HeyReach** (LinkedIn), **Instantly** (email), Kondo | Needed (Phase 2) |
| Booking / meeting intel | Cal.com, Sybill / Gong | Needed (Phase 3) |
| Alerts | **Slack / Telegram** | Telegram integrated |

---

## 7. What's needed to deploy the MVP (once fully built)

### Servers & services
- A **web server** (always-on for production; free tier sleeps when idle).
- A **dedicated worker** process (on the free tier it runs in-process; for production, split it out).
- A **managed PostgreSQL** with daily backups.
- A **managed Redis** with persistence (`noeviction`).
- An **LLM**: a Claude API key, *or* a self-hosted Ollama server (GPU) reachable from the app.

### Secrets & configuration (set per environment)
- `AUTH_SECRET`, `ENCRYPTION_KEY` (session + BYO-key encryption)
- `DATABASE_URL`, `DIRECT_URL`, `REDIS_URL`
- `ICP_LLM` (`ollama` / `anthropic`), `ANTHROPIC_API_KEY` *or* `OLLAMA_URL` + `OLLAMA_MODEL`
- Provider keys: `APOLLO_API_KEY`, `FIRECRAWL_API_KEY`, `HUBSPOT_SERVICE_KEY` (or OAuth app), `RB2B_*`, `BUILTWITH_*`, etc.
- `TELEGRAM_BOT_TOKEN` / `SLACK_*`, analytics keys

### Deploy steps
1. Push the repo to GitHub.
2. Connect to the host (e.g. Render Blueprint) — it provisions web + worker + Postgres + Redis.
3. Database migrations run automatically on deploy (`prisma migrate deploy`).
4. Add the secret keys above.
5. Point a custom domain at it and enable HTTPS.

### Production hardening
- Real domain + HTTPS · daily DB backups · error tracking + uptime monitoring · a secrets manager · the worker as its own always-on process.

---

## 8. Claude API fit & cost per full cycle

The system already runs on **local Ollama for free by default**. When you want
cloud-grade reasoning, the Claude API is a drop-in via the LLM router. Pricing below
is current per 1M tokens.

### Recommended model split
| Use it for | Model | Input / Output (per 1M) |
|---|---|---|
| Reasoning (ICP synthesis, scoring-formula generation, email drafts, flywheel analysis) | **Claude Sonnet 4.6** | $3 / $15 |
| High-volume batch (account qualification, contact role assignment, signal extraction) | **Claude Haiku 4.5** | $1 / $5 |
| Maximum-quality reasoning where it matters most (optional) | **Claude Opus 4.8** | $5 / $25 |

Haiku is ~5× cheaper than Opus on input; using it for the high-volume batch steps and
Sonnet for the few reasoning steps is what keeps a full cycle cheap.

### Cost of one full end-to-end MVP cycle (local testing, all tools connected)

Assumption: one cycle processes **~100 accounts** through the AI steps (1 ICP, 1
scoring formula, qualify 100 accounts, ~60 contact classifications, ~20 signal
extractions, ~10 play/email drafts, 1 flywheel analysis). Token sizes are typical
estimates.

| Step | Model | Calls | Est. cost |
|---|---|---|---|
| ICP synthesis | Sonnet 4.6 | 1 | ~$0.04 |
| Scoring-formula generation | Sonnet 4.6 | 1 | ~$0.02 |
| Account qualification | Haiku 4.5 | ~100 | ~$0.35 |
| Contact role classification | Haiku 4.5 | ~60 | ~$0.06 |
| Signal extraction (from scraped text) | Haiku 4.5 | ~20 | ~$0.11 |
| Play / email drafts | Sonnet 4.6 | ~10 | ~$0.12 |
| Flywheel analysis | Sonnet 4.6 | 1 | ~$0.02 |
| **Total — one full cycle (~100 accounts)** | | | **≈ $0.70** |

**Range:**
- **~$0.50 – $1.50** per full cycle on the recommended **Sonnet + Haiku** split (≈ **$0.005–$0.015 per account** — the per-account qualification dominates, so cost scales with account volume).
- **~$2 – $4** if every step runs on **Opus 4.8** (maximum quality).
- **~$0** running entirely on **local Ollama** (just electricity/compute).
- A pure **local test on ~10 accounts** is a few **cents** on Claude, or free on Ollama.

**Cost levers that lower this further:**
- **Prompt caching** — the ICP is reused across all 100 qualification calls; caching its tokens cuts input cost (cache reads are ~0.1× normal).
- **Batch API** — non-urgent qualification/classification at **50% off**.
- **Haiku-only** — run everything on Haiku for the cheapest possible cycle (lower reasoning quality on the synthesis steps).

> These are planning estimates from typical token sizes, not a billed measurement.
> Run one real cycle and read `usage` from the API responses to confirm against your
> actual prompt sizes.

---

## 9. Which tools could Claude replace — and which it can't

The key distinction: Claude is a **reasoning/text** engine. It can replace tools whose
job is *thinking, classifying, or writing.* It **cannot** replace tools whose job is
*proprietary data* — Claude has no company database and can't de-anonymize a website
visitor.

### Claude can replace these (reasoning / text work)
| Tool / role in the playbook | Claude replacement |
|---|---|
| **ChatGPT** (account scoring, qualification reasoning) | Claude directly — same job, one provider |
| **Claygent / AI Ark** (AI qualification of accounts) | Claude qualification call (Haiku for batch) |
| Clay's **AI enrichment logic** (the reasoning parts) | Claude (the *reasoning*; not Clay's data aggregation — see below) |
| **Content / email / message generation** | Claude (Sonnet for drafts) |
| **Signal extraction** from scraped pages | Claude reads the scraped text and extracts structured signals |
| ICP synthesis, scoring-formula generation, flywheel narratives | Claude — already how the system works |

### Claude can *partially* replace these (with its built-in web tools)
| Tool / role | Note |
|---|---|
| **Firecrawl / Exa / Perplexity** (web research, news) | Claude's **web search / web fetch** server tools can fetch and summarize URLs in-context — good for light research and news monitoring. For high-volume, JS-rendered scraping at scale, a dedicated scraper (Firecrawl) is still better. |

### Claude **cannot** replace these (proprietary data sources)
| Tool / role | Why not |
|---|---|
| **Apollo, Ocean.io, AI Ark (data), Sales Navigator, Store Leads** | Company/contact databases — Claude has no such directory |
| **RB2B, Warmly** (website visitor → company) | Requires a proprietary identity network; Claude can't de-anonymize traffic |
| **BuiltWith, Sumble** (technographics) | Proprietary tech-detection datasets |
| **Bombora, PredictLeads** (3rd-party intent) | Proprietary intent/news data networks |
| **G2, Crossbeam** (review / partner signals) | Live data from those platforms |
| **HubSpot, Salesforce** (CRM) | Systems of record — Claude integrates with them, doesn't replace them |

**Bottom line:** use Claude as the **brain** across the whole pipeline (qualification,
scoring reasoning, content, signal extraction), and keep specialist **data** providers
for the inputs Claude fundamentally can't produce. This is exactly the system's
design — our own engine code (optionally powered by Claude) replaces Clay's *no-code
orchestration brain*, while the data providers remain bring-your-own-key.

---

## 10. Cost: dedicated tools vs Claude (the reasoning layer)

This is the part a GTM buyer actually cares about: if Claude does the *thinking* work,
what does that cost versus the tools you'd otherwise license for it? Below is the
job-by-job comparison. **Read the units carefully** — the third-party tools bill as
**per-seat or per-month subscriptions / credit packs**, while Claude bills as
**metered API usage** (Sonnet $3/$15, Haiku $1/$5 per 1M tokens). It is
apples-to-oranges by design; the point is the order-of-magnitude gap on the reasoning
layer, not a like-for-like line item. All tool prices are current published 2026
pricing.

| Job in the pipeline | Typical tool & its cost | Claude for the same job | Verdict |
|---|---|---|---|
| **Qualify & score accounts** (the reasoning) | ChatGPT Business **$20–25/seat/mo**; or GPT-5.4-mini API ~**$0.004/acct** | Haiku **~$0.0035/acct** (~$0.35 per 100) | **Claude** |
| **Draft outreach & marketing content** | Jasper Pro **$59–69/seat/mo**; Copy.ai Chat **$29/mo** (5 seats) | Sonnet **~$0.012/draft** (cents each) | **Claude** |
| **Company research & signal summary** | Perplexity Pro **$20/seat/mo**; Sonar API ~**$0.03/acct** | Haiku **~$0.006/acct** + your own fetch | **Claude** \* |
| **AI enrichment orchestration** | Clay Growth **$495/mo** (~$0.55–1.00/acct, *mostly data*) | reasoning **<$0.01/acct** (data tools still needed) | **Partial** |
| **Scrape pages → structured extraction** | Firecrawl Standard **$99/mo** (~$0.005/acct scrape) | keep the scraper; Claude does the **extract** (cents) | **Partial** |

\* Claude replaces the *reasoning/summarization*; it still needs a paired fetch/scrape
tool (Firecrawl, or Claude's own `web_fetch`/`web_search` server tools) to supply the
source material. Perplexity bundles both retrieval + reasoning; Claude un-bundles them.

### The stack math

The reasoning-tool subscriptions a GTM team would otherwise stack up:

| Tool (reasoning role) | Realistic team plan | ~Monthly |
|---|---|---|
| ChatGPT Business (4 seats + light API) | qualification, scoring rationale, drafts | ~$80–160 |
| Clay Growth (the AI-qualification brain) | enrichment + AI qualification orchestration | ~$495–900 |
| Jasper Pro (5 seats) | outreach + marketing content | ~$295 |
| Perplexity Pro (4 seats) | account research + signal summary | ~$80–160 |
| Firecrawl Standard | scrape → extract | ~$99 |
| **Reasoning-stack subtotal** | | **~$1,050–1,600 / mo** |

Doing that **same reasoning volume** on Claude — even at ~20 full cycles/month
(~2,000 accounts qualified, scored, researched, and drafted) — is on the order of
**~$10–50/month in tokens** (and **~$0** if you run it on local Ollama, which is the
system's default). You don't eliminate the spend entirely: you still pay for the
**data** tools Claude can't replace (Apollo, RB2B, BuiltWith, Bombora, the CRM). But
the *reasoning subscriptions* collapse by ~20–100×, because you're paying for thinking
by the token instead of by the seat.

**Caveats that keep this honest:**
- These are list prices and modeled token sizes, not a billed invoice — confirm against your real prompt sizes and seat counts.
- Clay/Copy.ai also bundle genuine **data and workflow orchestration** value; replacing them with Claude means you rebuild that orchestration in our engines (which we have) and keep separate data feeds.
- Subscription tools give you a polished UI, collaboration, and governance out of the box; the Claude path trades that for our own product surface + lower marginal cost.

---

## 11. Summary

- The MVP is **built and deployed**; the plan is to swap demo data for real feeds (Phase 1), add outreach execution (Phase 2), then expand and add billing/teams (Phase 3).
- The **11-engine, event-driven** architecture buys fault isolation, independent scaling, and parallel ownership — at the cost of an event bus and a worker, which are contained for an MVP.
- Running one **full cycle** on the Claude API costs roughly **$0.50–$1.50 for ~100 accounts** with the Sonnet + Haiku split — or **free** on local Ollama.
- Claude can be the **reasoning engine** across the whole pipeline; it complements, but does not replace, the proprietary **data** providers (Apollo, RB2B, BuiltWith, Bombora, the CRM).
