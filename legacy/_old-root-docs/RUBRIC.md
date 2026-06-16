# ICP Rubric — v1

> **Status:** v1 starter (guess-based). Recalibrated against real won/loss data at the Phase 2 validation gate (ADR-011). Don't treat v1 as truth — treat it as a hypothesis we test.
>
> **Encoded at:** `packages/db/migrations/0001_seed_icp_rubric.sql`, applied to the OneGTMLab org.
>
> **Edited how:** change the JSON here, write a new migration (`0002_..._update_icp_rubric.sql`), bump `icp_rubrics.version`. Never mutate v1 in place — keep the history.

---

## Who we sell to (the ICP, plain English)

OneGTMLab sells the ABM Engine to **B2B SaaS companies** with:
- An existing CRM we integrate with (HubSpot today, Salesforce later)
- A real sales team (not founder-led only)
- Enough scale to need ABM but not so big they've built their own
- Based in markets where outbound ABM works (NA, UK/EU, ANZ)

Sweet-spot company: **50–500 employees, B2B SaaS, uses HubSpot, NA-based, has a 5+ rep sales team.**

---

## Fields + weights (max 100)

| Field | Source | Values → points |
|---|---|---|
| **Industry** (25) | `enrichment.industry` (HubSpot) | `COMPUTER_SOFTWARE`, `INTERNET`, `INFORMATION_TECHNOLOGY_AND_SERVICES` → **25** · `FINANCIAL_SERVICES`, `MARKETING_AND_ADVERTISING`, `MANAGEMENT_CONSULTING` → **15** · other B2B → **5** · B2C / consumer / non-business → **0** |
| **Employees** (25) | `enrichment.numberofemployees` (HubSpot) | 50–500 → **25** · 20–49 or 501–1000 → **15** · 10–19 or 1001–5000 → **5** · <10 or >5000 → **0** |
| **Country** (20) | `enrichment.country` (HubSpot) | US, CA, GB → **20** · DE, FR, NL, IE, AU, NZ → **15** · other EU, IL, SG → **10** · IN, BR, MX → **5** · other → **0** |
| **CRM in use** (20) | `external_crm_provider` (our column) | `hubspot` → **20** · `salesforce` → **15** · unknown / none → **0** |
| **Has a website** (10) | `enrichment.website` not null | non-empty → **10** · empty → **0** |

> The `Has a website` weight is a placeholder for "is this even a real company we can reach." Once enrichment is richer (Apollo/Clearbit), we replace it with `has-sales-team` (e.g. sales-role employee count ≥ 5) or `tech-stack-includes-Slack-or-Zoom` (a proxy for "modern B2B SaaS culture").

**Max possible:** 25 + 25 + 20 + 20 + 10 = **100**.

---

## Tier thresholds

| Tier | Range | What it means | Treatment |
|---|---|---|---|
| **Tier 1** | `fit_score ≥ 75` | Strong ICP fit — exactly who we want | 1:1 outreach, personal touch |
| **Tier 2** | `50 ≤ fit_score < 75` | Reasonable fit, missing one key attribute | 1:Many sequence |
| **Tier 3** | `25 ≤ fit_score < 50` | Adjacent — watch for buying signals before spending energy | Monitor only |
| **Drop** | `fit_score < 25` | Not ICP | Don't waste outreach budget |

---

## Examples (hand-calibration sanity check)

Apply the rubric to a few well-known companies to make sure the weights produce sensible tiers. If a "should-be Tier 1" company scores low, the weights are wrong — fix on paper before encoding.

| Company | Industry | Employees | Country | CRM | Website | Score | Tier | Sane? |
|---|---|---|---|---|---|---|---|---|
| **Stripe** | COMPUTER_SOFTWARE (25) | 5000+ (0) | US (20) | unknown (0) | yes (10) | 55 | T2 | Borderline — they're too big for our sweet spot. Sane. |
| **Notion** | COMPUTER_SOFTWARE (25) | 501–1000 (15) | US (20) | unknown (0) | yes (10) | 70 | T2 | Reasonable — top of T2. Sane. |
| **Linear** | COMPUTER_SOFTWARE (25) | 50–500 (25) | US (20) | unknown (0) | yes (10) | 80 | T1 | Yes — sweet-spot size + industry + geo. Sane. |
| **Acme Corp (test data)** | ANIMATION (0) | unknown (0) | unknown (0) | hubspot (20) | yes (10) | 30 | T3 | Animation studio with a HubSpot — adjacent at best. Sane. |
| **Initech (test data)** | COMPUTER_SOFTWARE (25) | 200 (25) | US-ish (20) | hubspot (20) | yes (10) | 100 | T1 | Pegged. Sane (and a useful test of the cap). |

> Most of our HubSpot-seeded accounts will score in **T2** because HubSpot's free Insights enrichment isn't populating `numberofemployees`/`country` yet. That's an enrichment-coverage problem, not a rubric problem — fixes itself when (a) HubSpot Insights catches up over the next ~1h, or (b) we wire Apollo/Clearbit in a later phase.

---

## What we deliberately did NOT include in v1

- **Revenue / funding stage** — HubSpot doesn't expose this in the free Insights enrichment. Add when we integrate Apollo/Clearbit.
- **Tech stack** (uses Slack? AWS? Segment?) — same reason. Defer to enrichment provider.
- **Recent hires / job changes** — that's a *signal*, not a fit attribute. Belongs to Phase 2's Signal Scorer.
- **Past engagement** (visited pricing, opened email) — same as above, signal not fit.

Per ADR-009 / hard rule #4: fit = static company traits; signal = time-sensitive behavior. Don't mix them in the rubric.

---

## How this gets validated (Phase 2 gate)

At the Phase 2 validation gate (ADR-011), we measure:

1. Pull all `closedwon` Deals from HubSpot.
2. Compute distribution of their account fit-scores. → **Expectation: skewed toward T1.**
3. Pull all `closedlost` Deals.
4. Compute their fit-score distribution. → **Expectation: skewed toward T3 / Drop.**
5. If overlap is large (T1 wins similar to T1 losses), v1 weights are wrong. Tune.

We can't do this today — OneGTMLab has no `closedwon`/`closedlost` history yet. **Calibration happens when real customers exist.** For now we ship a defensible guess.
