# ABM Engine — Live Demo Script

> A plain-English runbook for demoing the system. For each engine: **what it does**
> (no jargon), **where to show it**, **what to click**, and **what to say**. Follow
> it top to bottom — it's the natural order a real user would work in.

---

## Before the demo (5-minute setup)

1. **Log in** at `https://abm-web.onrender.com` (the free server sleeps — open it
   ~2 minutes early so the first page is warm, not loading).
2. **Load demo data:** go to `/demo` → click **Load demo data** → wait ~30–60s
   until it finishes (it writes ~1,500 rows). This fills every page so nothing is
   empty.
3. *(Optional, for real AI)* start your Ollama tunnel so the ICP wizard generates
   live output instead of a mock.
4. Have **HubSpot open in a second tab** if you'll show the CRM push.

**One-line honesty note to keep in your back pocket:** *"This is running on demo
data so every screen is populated — the same screens fill with real data once we
connect your Apollo / RB2B / HubSpot keys."* Say it once, early, and nobody feels
misled.

---

## The 30-second opener (before you click anything)

> "This is an account-based marketing engine. Instead of marketing to everyone and
> hoping, it figures out exactly which companies are worth selling to, watches them
> for signs they're ready to buy, and tells your reps who to contact and when — then
> writes it all back into your CRM and learns from every deal you close. It's the
> same 2026 ABM Playbook you designed, built as working software. Let me walk you
> through it."

Then go in this order.

---

## 1 · ICP Engine — "Who is our ideal customer?"

- **What it does (say this):** "Everything starts here. We define your perfect
  customer — what industry, size, tech, and buying signals make a great fit. You
  can answer 12 questions, or it can learn your ICP automatically from your past
  closed deals."
- **Show:** go to **ICP** in the sidebar.
- **Do live:** open the ICP → point at the firmographics, technographics, and the
  exclusions. *(Optional wow:)* click **New ICP → wizard**, answer a couple of
  questions, and show the AI drafting the rest.
- **Point at:** the structured profile — "this becomes the instruction set every
  other engine follows."

## 2 · TAM Builder — "Find every company that matches"

- **What it does:** "Once we know the ideal customer, this goes and finds *all* the
  real companies that match — from Apollo and other databases — so you have your
  total addressable market, not a guess."
- **Show:** **Target Accounts** in the sidebar.
- **Do live:** point at the list of companies. *(Optional:)* click **Source
  accounts** to show it pulling real companies from Apollo live.
- **Say:** "These are real companies matching the ICP — no manual list-building."

## 3 · Enrichment Engine — "Fill in the details"

- **What it does:** "Each company gets enriched — size, revenue, tech stack — and
  then AI-qualifies whether it's genuinely a fit or not, with a reason."
- **Show:** open an account from the Target Accounts list.
- **Point at:** the firmographic/tech detail and the qualification verdict + reason.
- **Honesty note:** "Enrichment is on demo data today; it goes live the moment we
  add your enrichment key."

## 4 · Scoring Engine — "Grade and rank them"

- **What it does:** "Not every match is equal. This gives every company a 0–100 fit
  score and sorts them into Tier 1, 2, 3. The sliders let you tune what matters
  most — industry vs. company size vs. tech."
- **Show:** **Scoring** in the sidebar.
- **Do live:** nudge a **weight slider**, then click **Run scoring** → show the tier
  counts update.
- **Say:** "Tier 1 is who your reps should chase first. This is the filter between
  'all companies' and 'the accounts worth my time.'"

## 5 · TAL Manager — "The official target list"

- **What it does:** "The scored accounts become your finalized Target Account List —
  the single source of truth your team works from. You can suppress accounts (e.g.
  existing customers) and it keeps versioned snapshots."
- **Show:** **Target Accounts** → the finalized list with **Tier 1 / 2 / 3** filters.
- **Do live:** click a tier filter; show **Export CSV** and the **Push to HubSpot**
  button.
- **Say:** "This is the list everything downstream is built on."

## 6 · Contact Engine — "Find the buying committee"

- **What it does:** "For each target company it finds the *people* — the decision
  maker, the champion, the influencers — with verified emails. You're not selling to
  a logo, you're selling to a committee."
- **Show:** **Contacts** in the sidebar.
- **Do live:** click **View map** on an account → show the committee grouped by role.
- **Say:** "Decision maker, champion, influencer — automatically mapped per account."

## 7 · Signal Engine — "Watch for buying intent"

- **What it does:** "This is the always-on radar. It tracks buying signals — someone
  visiting your pricing page, a company hiring, a tech change, review-site activity —
  and scores each one. A pricing-page visit is worth a lot more than a generic
  mention."
- **Show:** **Signals** in the sidebar.
- **Do live:** point at the **live signal feed**; click **Research** on an account to
  show it pulling real signals (hiring, tech change) live.
- **Honesty note:** "Website-visit signals are the one piece that needs RB2B to know
  *which* company is visiting — that's the top item on our list."

## 8 · Awareness Engine — "How warm is each account?"

- **What it does:** "All those signals roll up into one score and a funnel stage —
  Identified → Aware → Interested → Considering → Selecting. It's exactly the
  awareness funnel from your playbook."
- **Show:** **Awareness** (or the dashboard).
- **Point at:** accounts moving through the 5 stages.
- **Say:** "This tells you who's just looking versus who's about to buy."

## 9 · Demand Gen Orchestrator — "Do the right thing, automatically"

- **What it does:** "When an account gets hot, the system fires the right play on its
  own — alerts the rep, drafts the outreach, creates a CRM task. The rep just acts
  and marks the outcome."
- **Show:** **Campaigns** in the sidebar.
- **Do live:** show the play queue; point at a fired play and the **Contacted / Not
  interested / Snooze** buttons. Mention the **Telegram/Slack alert** that fires.
- **Say:** "Nothing slips — the system tells the rep exactly when and who to contact."

## 10 · CRM Sync Engine — "Write it all back to your CRM"

- **What it does:** "Everything — tiers, contacts, scores, tasks — gets written back
  into HubSpot, so your reps never leave the CRM they already use. It works both ways:
  it also reads your closed deals back in to keep learning."
- **Show:** **Target Accounts** → **Push to HubSpot** (and **Data Sources** for the
  import side).
- **Do live:** click **Push to HubSpot**, then switch to your HubSpot tab and refresh
  → show the companies/contacts appear.
- **Say:** "The CRM feeds the brain, and the brain feeds the CRM."

## 11 · GTM Flywheel — "Learn from every deal"

- **What it does:** "This closes the loop. On every closed deal it figures out which
  signals predicted the win, shows your pipeline and win-rates by tier, and feeds that
  back to sharpen the ICP. The system gets smarter every quarter."
- **Show:** **Analytics** in the sidebar.
- **Point at:** won/lost counts, pipeline by tier, the **signal correlation**, and the
  multi-touch attribution.
- **Say (the closer):** "Engine 11 feeds back into Engine 1 — the customers you
  actually close become the next version of your ICP. That's the flywheel."

---

## The closing line

> "So that's the whole loop — from defining the ideal customer, to finding and ranking
> them, to spotting when they're ready, to acting automatically, to learning from what
> closes. It's your 2026 ABM Playbook running as working software. The pipeline is
> built; connecting your real data feeds is what turns it on for your accounts."

---

## Likely questions (and honest answers)

- **"Is this real data?"** — "These screens are on demo data so everything's
  populated. The engines are real and deployed; they fill with real data once we
  connect Apollo, RB2B, and your HubSpot."
- **"How does it know who's visiting my site?"** — "Today that's demo-grade. We plug
  in RB2B (or Clearbit) — they run a data network that identifies the company behind
  an anonymous visit. That's the top item on our build list."
- **"How is this different from 6sense / Demandbase?"** — "Same idea, lighter and
  CRM-agnostic — and it learns from your closed deals instead of a static rubric."
- **"What do you need from us to go live?"** — "Three keys to start: Apollo (sourcing),
  RB2B (visitor ID), and HubSpot access — plus a CRM export of past deals so the ICP
  learns from your real wins."
- **"Why is a page slow to load?"** — "It's on a free server that sleeps when idle;
  production runs always-on."
