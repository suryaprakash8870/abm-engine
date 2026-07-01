# Understanding This Product — a plain-English guide

> Written for the builder. No jargon. Read one section at a time. This explains
> what ABM is, the real market, your own system, and the path to a paying customer.

---

## Part 1 — A real customer, day by day

Meet **"Flowbase"** — a fictional but realistic B2B SaaS company. They sell
project-management software to mid-size teams. They have 6 salespeople. Their
problem: the reps waste their days emailing companies that will never buy.

Flowbase's RevOps lead, Priya, signs up for your product.

### Day 1 — Setup (30 minutes)
1. Priya opens the **ICP wizard** and answers 12 questions about Flowbase's best
   customers (industry, size, who buys, what triggers a purchase).
2. The AI turns that into an **Ideal Customer Profile** — a precise definition of
   their perfect customer.
3. She clicks **Source Accounts**. Apollo pulls in real companies that match.
4. **Scoring** ranks them into Tier 1 / 2 / 3. The **TAL** (Target Account List)
   now holds the ~50 best-fit companies.
5. She pastes your **tracking snippet** onto Flowbase's marketing site.

That's it for setup. She closes her laptop.

### Day 7 — It starts working on its own
- A few Tier-1 companies have visited Flowbase's **pricing page** (the snippet
  caught it) → **Signals** appear.
- The **Contact engine** has found the buying committee at each Tier-1 account —
  the VP who decides, the manager who champions, with verified emails.
- One account crosses the threshold → a **Play fires** → Priya's rep gets a
  **Telegram/Slack alert**: *"Acme Corp is hot — VP of Eng visited pricing 3×.
  Here's a drafted email."*

### Day 30 — The loop closes
- Flowbase has closed 3 deals from accounts the system flagged.
- The **GTM Flywheel** notices *which* signals those winners had in common, and
  **automatically sharpens the ICP** — so next month's targeting is smarter.
- Everything (accounts, contacts, scores, tasks) is written back into Flowbase's
  **HubSpot**, so reps never leave the CRM they already use.

**The outcome Priya pays for:** her 6 reps now spend their time on the 50 accounts
most likely to buy, instead of cold-emailing 5,000. Same team, more deals.

---

## Part 2 — The real market (you are not imagining this)

This is a large, proven category. Real companies, real revenue:

| Company | What they do | Rough price | Maps to your engine |
|---|---|---|---|
| **6sense** | Full ABM platform — intent, scoring, orchestration | ~$60k–$150k+/yr | The whole system |
| **Demandbase** | Full ABM platform (6sense's main rival) | ~$50k–$130k+/yr | The whole system |
| **Clay** | Sourcing + enrichment automation (very hot) | $149–$800+/mo | TAM + Enrichment |
| **Apollo.io** | Company + contact data, sequences | Free → ~$100/mo/seat | TAM + Contacts |
| **ZoomInfo** | Premium B2B data | ~$15k+/yr | TAM + Contacts |
| **Clearbit** (HubSpot) | Enrichment + visitor reveal | Enterprise | Enrichment + Signals |
| **RB2B / Koala** | "Which company is on my site right now" | Free → ~$500/mo | Signals (visitor ID) |
| **HubSpot / Salesforce** | The CRM everyone writes back to | Varies | CRM Sync target |

**Where you fit:** 6sense and Demandbase are powerful but **expensive and heavy**
— built for big enterprises. The gap you can own: a **lighter, cheaper,
CRM-agnostic ABM brain** for *smaller* B2B SaaS companies who can't afford 6sense
but have outgrown spreadsheets. "6sense for the rest of us."

**Your one real differentiator to lean on:** the **GTM Flywheel** — most tools
target based on a static rubric you set once. Yours *learns from your closed
deals* and updates the ICP automatically. That's a genuinely good story.

---

## Part 3 — Your 11 engines in plain English

Think of it as a **factory line**. A company goes in one end; a "ready-to-sell,
prioritized account" comes out the other. Each engine does one job and hands off.

1. **ICP Engine** — Decides *who* your ideal customer is. (The blueprint.)
2. **TAM Builder** — Finds *all* the real companies matching that blueprint. (Apollo.)
3. **Enrichment** — Fills in details about each company (size, tech, industry).
4. **Scoring** — Grades each company 0–100 and sorts into Tier 1/2/3. (The filter.)
5. **TAL Manager** — Keeps the final shortlist of accounts worth pursuing.
6. **Contact Engine** — Finds the *people* at each company (the buying committee).
7. **Signal Engine** — Watches for *buying intent* (site visits, hiring, research).
8. **Awareness Engine** — Tracks how "warm" each account is (a funnel stage).
9. **Demand-Gen Orchestrator** — *Acts*: fires plays (alerts, tasks, emails) when
   an account is hot. (The trigger finger.)
10. **CRM Sync** — Writes everything back to HubSpot/Salesforce. (The bridge.)
11. **GTM Flywheel** — Learns from closed deals and improves the ICP. (The loop
    back to Engine 1.)

**The one-line flow:**
> Define who → find them → grade them → find their people → watch for intent →
> act → write to CRM → learn from wins → repeat, smarter.

Why split into 11? So each part can fail, scale, or be swapped independently —
and so the system is *event-driven* (each engine reacts to the one before it).

---

## Part 4 — The honest path to a first paying customer

You've built the engine. Here's the prioritized road from "demo" to "someone pays."

### Stage A — Make it real for ONE company (highest priority)
1. **Pick one real target customer** — ideally your own company, or a friendly
   founder you know who does B2B sales.
2. **Run their real ICP** through it (real answers, real Apollo sourcing).
3. **Install the tracking snippet on their real site.**
4. Goal: produce **one genuinely useful insight** for a real business. That
   single moment — "huh, the system told me something I didn't know" — is what
   turns a demo into a product.

### Stage B — Close the "fake" gaps that matter
5. **Real visitor identification** — integrate **RB2B** (has a free tier) so site
   visits map to *real* company names, not random ones. This is the single
   biggest "make it real" upgrade.
6. **Billing** — add **Stripe** so someone can actually subscribe.
7. **Onboarding polish** — the 30-minute Day-1 flow needs to be smooth for a
   stranger, not just you.

### Stage C — Sell it
8. Write a **one-page pitch**: "We're 6sense for small B2B SaaS — and we learn
   from your closed deals." 
9. Find **3 design partners** (companies who use it free in exchange for feedback).
10. Charge the 4th one. Start cheap ($200–$500/mo) — you're not 6sense yet, and
    that's fine.

### What to deliberately SKIP for now
- Don't build Salesforce support yet (HubSpot is enough for v1).
- Don't build the ad-audience push yet.
- Don't perfect every engine — get one real customer first; *they'll* tell you
  what's actually missing.

---

## The mindset shift

You feel "something's missing" because you've been judging this as **software**
("does it run?") when the missing piece is **a customer** ("does it help someone
real?"). The code is the hard 80% and it's *done*. The remaining 20% — one real
user, real visitor data, a way to pay — is what will make it finally *feel* real.

You're closer than you think.

---

## Part 5 — How you compare to Demandbase (from their own product demos)

We studied four Demandbase product-tour transcripts (Sales, Marketing, Data
Integrity, Campaign Builder). The headline: **Demandbase is a *bundle* of products,
and you have independently built its valuable core.**

### Their features → your engines

| Demandbase feature | Your engine | Status |
|---|---|---|
| Qualification Score ("looks like my best customers?") | ICP + Scoring | ✅ have it |
| Pipeline Predict ("likely to convert in 30 days") | GTM Flywheel | 🟡 embryo |
| Journey stages (funnel progression, sales handoff) | **Awareness Engine** | ✅ direct match |
| Buying groups / roles / coverage | Contact Engine | ✅ have it |
| Intent + site analytics + engagement | Signal Engine | 🟡 partial |
| Prescriptive dashboard (rank by engagement/intent) | Plays + Scoring | ✅ have it |
| "Already in CRM? add/update?" | CRM Sync (upsert) | ✅ have it |

Their jargon = your engines: **"journey stages" = Awareness Engine**,
**"Qualification Score" = ICP + Scoring**, **"Pipeline Predict" = Flywheel**.

### The #1 real gap (their demos prove it matters most)
**Anonymous visitor → real company identification.** Both demos hammer "see exactly
which companies visit your website" and "116% increase in page views = they're
ramping to buy." Yours assigns visits to a *random* account. Fixing this (RB2B /
Clearbit Reveal) is the single biggest "make it real" upgrade.

### Cheap wins worth stealing
- **Contact quality score (A / A+)** — reachability grade (phone/mobile/valid email).
  You already verify emails; just surface the grade.
- **News agents** — alert on exec hire / funding for target accounts (extend TheirStack).
- **Per-account engagement timeline** — "what has this account been doing?" history view.
- **Stage-based messaging** — vary the play/message by Awareness stage (you already
  have stage-based play templates). Their most-repeated principle: the message changes
  as the account gets more engaged.
- **TAL → ad-audience export** — push the account list to LinkedIn/Google Ads as a
  matched audience. You produce every input their ad builder needs (TAL, journey
  stages, buying groups, keywords) — you just lack the ad-serving DSP, so let
  LinkedIn/Google do the serving.

### Deliberately SKIP (enterprise rabbit holes)
- **Data Integrity** (CRM data-hygiene product) — your upsert + enrichment cover the
  basics; a full data-quality product is a separate, heavy business.
- **Building a real ad-serving DSP** — that's ad-tech, a massive separate undertaking.
  Export audiences instead.

### The strategic read
Demandbase = sales intelligence + marketing analytics + data hygiene + advertising,
bundled and priced for enterprises. You've built the **intelligence core** — the
valuable, defensible part. Win by doing that core well, cheaper, for smaller B2B SaaS
— not by half-cloning all four product lines.
