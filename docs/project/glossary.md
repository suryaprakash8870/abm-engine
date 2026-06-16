# Glossary

> Plain-language definitions so anyone — technical or not — can follow the project.

## ABM concepts

**ABM (Account-Based Marketing)** — Instead of marketing to many random leads, you pick a defined set of high-value target companies and focus all sales and marketing effort on them.

**ICP (Ideal Customer Profile)** — A structured description of the kind of company most likely to become a great customer: their industry, size, location, tools they use, and buying triggers.

**TAM (Total Addressable Market)** — Every company in the world that could theoretically match your ICP. The raw, unfiltered universe of possible customers.

**TAL (Target Account List)** — The curated, scored, tiered list of companies you are actively going after right now. The output of filtering the TAM.

**Tier** — A grouping of accounts by fit. Tier 1 = best fit (most effort), Tier 2 = good fit, Tier 3 = okay fit (least effort).

**Buying committee** — The group of people at a company involved in a purchase decision. Usually 3-7 people.

**Decision maker** — The person who controls the budget and signs the contract.

**Champion** — The internal advocate who wants your product and pushes the deal forward.

**Influencer** — Someone with input on the decision (like IT or Finance) who can help or block it.

**Signal** — Any sign a company might be ready to buy: a website visit, an email reply, a funding round, a relevant job posting.

**Awareness score** — A single number (0-100) representing how actively a company is in a buying phase right now, based on their signals.

**Awareness stage** — A label for how warm an account is: Identified → Aware → Interested → Considering → Selecting.

**Play** — A specific sales action taken in response to an account's state: a personalised email, a sequence enrolment, a Slack alert, a CRM task.

**Enrichment** — Filling in missing details about a company (industry, size, tech stack) by looking them up in data providers.

**GTM (Go-To-Market)** — The overall strategy and machinery for taking a product to customers. A "GTM engineer" builds and operates this machinery.

## Technical concepts

**Engine** — One of our 11 independent services, each doing one job in the ABM pipeline.

**Event** — A message one engine publishes to announce it finished work, which other engines react to. Example: `accounts.enriched`.

**Event bus** — The shared channel all engines use to send and receive events. Like a noticeboard everyone watches.

**Microservices** — An architecture where the system is split into small independent services (our engines) rather than one big application.

**Pipeline** — The forward flow of data through the engines, from ICP to final action.

**Flywheel** — The feedback loop where outcomes (won/lost deals) flow back to make the system smarter over time.

**Webhook** — A way for an external system (like HubSpot) to notify us instantly when something happens, by sending us an HTTP request.

**OAuth** — A secure way for a user to connect their account (HubSpot, Slack) to our app without sharing their password.

**RLS (Row Level Security)** — A database feature that ensures one customer can never see another customer's data, enforced by the database itself.

**Multi-tenancy** — One application serving many separate customers (tenants), each isolated from the others.

**Cache** — A temporary store of already-computed results so we don't repeat expensive work (like re-enriching the same company).

**TTL (Time To Live)** — How long a cached item stays valid before it must be refreshed.

**Dead-letter queue** — Where failed events go after all retries are exhausted, so they can be inspected and manually retried.

**Correlation ID** — A unique tag attached to every event in one pipeline run, so we can trace a problem back through all the engines.

## Our specific tools

**Claude** — The AI model (by Anthropic) we use for reasoning tasks. Sonnet for complex reasoning, Haiku for fast cheap batch work.

**Apollo** — A database of companies and contacts we search and enrich from.

**Clearbit** — A backup data provider for company enrichment.

**BuiltWith** — Tells us what software tools a company uses on their website.

**RB2B** — Identifies which company a website visitor works for, from their IP address.

**Supabase** — Our database and login system.

**BullMQ / Redis** — Our event bus and background job system.

**HubSpot / Salesforce** — The CRMs (customer databases) our users connect.

**Stripe** — Handles subscription billing.
