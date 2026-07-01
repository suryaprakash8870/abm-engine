# ABM Engine — Phase 2 Tooling & Access Requirements

**Prepared for:** OneGTMLab GTM team (tool owners / budget)  ·  **From:** ABM Engine build team  ·  **Date:** 1 July 2026

> Purpose of this document. The MVP is built end to end — all 11 engines run and the full flow demos today. Most of it currently runs on **live data where we already have a key, and realistic sample data everywhere else.** This document maps every engine to the tool it needs to run on *live* data, shows what is already connected, and lists exactly what we need from you — an **API key, a seat, or budget approval** — to make the full MVP work. Where you already pay for a tool or have a preference, please tell us: a **"Your input"** section is at the end, and we will wire to what you already own before buying anything new.

---

## 1. What is already live today

These are connected and working right now — no action needed.

| Layer | Tool connected now | Engines it powers | Status |
|---|---|---|---|
| AI / reasoning | Ollama + **Qwen 2.5** (local) | all engines' AI work | Live · $0 (runs on our box) |
| CRM | **HubSpot** (private-app key) | 10 · CRM Sync | Live |
| Company data (TAM) | **Apollo** | 02 · TAM, 06 · Contacts | Partial — company search live; contact/people search on the current plan falls back to sample data |
| Web research / scraping | **Firecrawl** | 03 · Enrichment, 07 · Signals | Live |
| Alerts / routing | **Telegram** bot | 08 · Awareness, 09 · Orchestrator | Live (our Slack-equivalent) |
| Product & site analytics | **PostHog** | 07 · Signals (1st-party) | Live |
| Login | **Google OAuth** | platform | Live |
| Database & queue | **Supabase Postgres + Redis** | platform | Live |

**Everything else in your 2026 ABM Playbook currently runs on sample data.** The rest of this document is the list of tools that turn each sample into live.

---

## 2. What each engine needs for the full MVP

Mapped one-to-one against the stages in your 2026 ABM Playbook.

| Engine (job) | Playbook stage | Live now | Needs for full MVP | What we need from you |
|---|---|---|---|---|
| **01 · ICP** — build the Ideal Customer Profile | Closed Won / Lost → ICP Model | Qwen + HubSpot deal history | Nothing new — sharpens as real closed deals land | Connect the CRM that holds your real closed-won / closed-lost history |
| **02 · TAM Builder** — source all matching companies | Broad TAM Map → Databases + Scraping | Apollo company search | Real company volume + niche-source scraping | Upgrade Apollo plan **or** tell us which DB you license (Ocean.io, Sales Navigator, Store Leads) |
| **03 · Enrichment** — enrich + AI-qualify | Data Enrichment + Qualification (Clay) | Firecrawl + Qwen; domain-derived fallback | A firmographic / technographic data provider | **Clearbit key** or **Apollo enrich** add-on, **or** access to your **Clay** workspace |
| **04 · Scoring** — score + tier accounts | Account Scoring (Clay + ChatGPT) | Our rubric engine + Qwen | Nothing external — Qwen replaces ChatGPT here | Just confirm the scoring rubric with your GTM team |
| **05 · TAL Manager** — build the target list | Enriched TAL + ABM Ads (HubSpot, LinkedIn) | HubSpot list sync | LinkedIn for ABM ad audiences | **LinkedIn Campaign Manager** access (+ optional ad budget) |
| **06 · Contact Engine** — source the buying committee | Contact Sourcing (DM / Champion / Influencer) | Apollo (sample contacts) | Real contacts + verified emails | **Apollo contact plan** upgrade **or** your preferred contact DB (Sales Navigator, Lusha, Cognism) |
| **07 · Signal Engine** — track buying signals | 1st / 2nd / 3rd-party signal tracking | PostHog + Firecrawl + Qwen + HubSpot | Intent + technographic feeds | **TheirStack API key** (job/hiring signals — already built, just needs the key); then decide on an intent vendor (G2 / Bombora) if in budget |
| **08 · Awareness** — score awareness + route | Awareness Score + Lead Routing | Our scoring + Telegram + HubSpot tasks | Slack, only if you prefer it over Telegram | Keep Telegram, **or** give us a **Slack** incoming-webhook |
| **09 · Orchestrator** — execute the play | Demand Generation (1:1 + 1:many) | Fires plays, drafts email w/ Qwen, HubSpot task + Telegram | A tool that actually **sends** the outreach; ad platform for retargeting | Pick an **email-sending tool** (Smartlead / Instantly / Outreach) + key; confirm which channels are in MVP scope |
| **10 · CRM Sync** — write everything back | Push Back to CRM (HubSpot, Salesforce) | HubSpot read/write | Salesforce, only if you use it | HubSpot-only, **or** also **Salesforce** (then a connected app) |
| **11 · GTM Flywheel** — attribution + ICP feedback | GTM Flywheel → Closed Won → Final Output | Fully local — reads deals, attributes, feeds ICP | Nothing new — compounds as real deals close | None — it improves automatically with live data |

---

## 3. The procurement list — grouped by priority

Costs are **rough monthly estimates** to be confirmed against your existing contracts, not quotes.

### Must-have — required to call the MVP "fully working"

| Tool | Purpose | Engine(s) | Est. cost / mo | The ask |
|---|---|---|---|---|
| **Apollo** — paid tier (contacts + enrich) | company + contact data, verified emails | 02, 03, 06 | ~$49–99 / seat | Upgrade the current key, or confirm an alternative |
| **Email sender** (Smartlead / Instantly) | actually send the outreach the orchestrator drafts | 09 | ~$30–97 | Pick one and share the API key |
| **TheirStack** | job-posting / hiring + tech-stack signals | 07 | ~$0–49 (has free tier) | Provide the API key — the integration is already built |
| **Clearbit** or **Clay** | reliable firmographic / technographic enrichment | 03 | Clearbit varies · Clay ~$149–495 | Provide a key, or access to your Clay seat |

### Strongly recommended — bigger signal and reach

| Tool | Purpose | Engine(s) | Est. cost / mo | The ask |
|---|---|---|---|---|
| **LinkedIn Ads** (Campaign Manager) | ABM ad audiences + retargeting | 05, 09 | ad budget | Grant account access |
| **Intent data** (G2 or Bombora) | 2nd / 3rd-party "in-market" signals | 07 | enterprise $$$ | Decide if it's in budget this phase |
| **Slack** | routing / alerts, if preferred over Telegram | 08, 09 | free | Add an incoming-webhook |

### Optional / later — not MVP-blocking

| Tool | Purpose | Engine(s) | The ask |
|---|---|---|---|
| **Salesforce** | only if it is your CRM | 10 | Connected app |
| **Sales Navigator / Lusha / Cognism** | extra contact coverage | 06 | Seat (optional) |
| **Apify / Octoparse** | scraping niche sources Apollo misses | 02 | Usage (optional) |
| **Anthropic Claude** key | upgrade AI quality over local Qwen for the hardest reasoning | all | Usage-based (optional) |

---

## 4. Decisions we need from you

These few choices unblock most of the list above.

1. **CRM:** HubSpot only, or HubSpot **and** Salesforce?
2. **What do you already pay for?** So we reuse your contracts instead of double-buying — Apollo tier, Clay, Clearbit, Bombora / G2, LinkedIn Ads, an email tool, Sales Navigator.
3. **Budget ceiling** for tooling during the MVP phase (per month)?
4. **Alert channel:** keep Telegram, or move to Slack?
5. **Demand-gen channels in MVP scope:** email only, or also ads / parallel dialing / webinars?
6. **Data / compliance constraints:** GDPR, target geographies, any vendor you cannot use?

---

## 5. Your input & suggestions

We built this list to match your playbook, but you know your stack and budget better than we do. **Please review, swap, or add** — we will connect whatever you already own first.

| Area | Our proposal | Tool you already have / prefer | Notes |
|---|---|---|---|
| Company data | Apollo (paid) |  |  |
| Contact data | Apollo contacts |  |  |
| Enrichment | Clearbit or Clay |  |  |
| Intent signals | TheirStack + (G2 / Bombora) |  |  |
| Email sending | Smartlead / Instantly |  |  |
| Ads / retargeting | LinkedIn Ads |  |  |
| CRM | HubSpot (+ Salesforce?) |  |  |
| Alerts | Telegram (or Slack) |  |  |
| **Anything we missed** | — |  |  |

---

## 6. How we handle any key you share

- Every key is **encrypted at rest, scoped to your workspace, and never written to logs.**
- Each tool maps to **one engine** — a key only does the job listed above.
- We start each integration in a **sandbox / test mode** and show you results before it touches any live send or CRM write.
- You can **revoke any key at any time** from the Data Sources page; the engine falls back to sample data, nothing breaks.

---

## Appendix — suggested note to send with this document

> Hi [name] — sharing a short list of the tools we need to move the ABM Engine from the demo (running on sample data) to a **fully working MVP on live data.** It maps each of the 11 engines to the exact tool it needs, marks what we've already connected (Qwen, HubSpot, Apollo, Firecrawl, Telegram), and flags what we need from you — mostly **API keys or access to tools you may already own.** There's a short "decisions" section and an "your input" table at the end — please add anything you already pay for or would swap in, so we connect what you have before buying anything new. Happy to walk through it on a quick call.
