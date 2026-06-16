# Decisions (ADR)

> Architecture Decision Records. Every significant technical or product decision, newest first.
> Format: Context → Decision → Why → Consequences. Add a new entry whenever a real decision is made.

---

## ADR-012 — Microservices via engine boundaries, monolith deployment for MVP

**Status:** Accepted

**Context:** The 11 engines are conceptually microservices, but running 11 separate deployed services in MVP adds enormous operational overhead for a small team.

**Decision:** Enforce engine boundaries in code (separate `lib/engines/*` folders, separate DB schemas, event-only communication, no cross-engine DB queries) but deploy everything as one Next.js app + BullMQ workers on Vercel for MVP. Extract individual engines into standalone services only when scale demands it.

**Why:** We get the architectural benefits (clean boundaries, independent development, easy future extraction) without the operational cost of managing 11 services. Because engines only communicate through events and never share databases, extracting one into its own service later requires zero changes to other engines.

**Consequences:** Discipline is required — it is tempting to take a shortcut and query another engine's table directly when everything is in one codebase. This must be caught in code review. The boundary is logical, not yet physical.

---

## ADR-011 — Event bus on BullMQ + Redis Streams, not Kafka

**Status:** Accepted

**Context:** Engines need a message bus. Options: Kafka, RabbitMQ, AWS SQS/SNS, or BullMQ on Redis.

**Decision:** BullMQ on Upstash Redis Streams.

**Why:** BullMQ is already in the stack for background jobs. It supports pub/sub via Redis Streams, has excellent TypeScript support, built-in retries, priorities, rate limiting, and dead-letter queues. Kafka is operational overkill for MVP volumes. Upstash is serverless — no Redis server to manage. We can migrate to Kafka later if event volume justifies it, behind the same publish/subscribe abstraction.

**Consequences:** Redis Streams has lower throughput ceilings than Kafka. Fine for MVP and well beyond. The `lib/events/` abstraction must hide the implementation so a future swap is contained.

---

## ADR-010 — One database schema per engine, shared enrichment cache

**Status:** Accepted

**Context:** Microservice orthodoxy says each service gets its own database. But running 11 Postgres instances in MVP is wasteful.

**Decision:** One Supabase Postgres instance, but each engine owns a distinct set of tables and no engine queries another's tables. The only shared table is `enrichment_cache`, written solely by Engine 03 and read by others.

**Why:** Logical schema separation gives us the data-ownership benefits without 11 database instances. The shared enrichment cache is a deliberate exception — company enrichment data is public, not workspace-private, and sharing it across workspaces is the single biggest cost saver (enrich Salesforce.com once, not once per customer).

**Consequences:** Must enforce "no cross-engine queries" in review. The shared cache must never contain workspace-private or personal data — only public company firmographics/technographics.

---

## ADR-009 — Haiku for batch, Sonnet for reasoning

**Status:** Accepted

**Context:** LLMs are used in 8 of 11 engines. Cost could balloon if we use the most capable model everywhere.

**Decision:** Use `claude-haiku-4-5` for high-volume batch classification (account qualification, role assignment, signal classification). Use `claude-sonnet-4-6` for low-volume reasoning (ICP synthesis, scoring formula generation, email drafts, flywheel analysis).

**Why:** Haiku is ~18x cheaper. Qualifying 2,500 accounts costs ~$2 with Haiku vs ~$37 with Sonnet — for an identical binary classification. Sonnet's reasoning depth is only needed for creative synthesis and nuanced judgment.

**Consequences:** Two model configs to maintain. Batch prompts must be tightly structured for Haiku to perform well. Quality monitoring (spot-check sampling) needed to catch Haiku misclassification.

---

## ADR-008 — Apollo API directly, not Clay

**Status:** Accepted

**Context:** The reference ABM playbook uses Clay for enrichment. Should we integrate Clay or build our own pipeline on Apollo?

**Decision:** Build the enrichment pipeline directly on Apollo + Clearbit. Do not integrate Clay.

**Why:** Clay is a UI-first product with no public programmatic API for third parties to build on. Building our own Apollo-based pipeline gives full control over cost, caching, and logic, with better unit economics at scale.

**Consequences:** We own data quality and pipeline maintenance. We can differentiate on enrichment speed and quality.

---

## ADR-007 — Three ICP modes, not one

**Status:** Accepted

**Context:** ~40% of potential users have no CRM or insufficient deal history. A CRM-only ICP flow would exclude them.

**Decision:** Three ICP modes — Hypothesis (AI wizard), CRM Analysis, CSV Import — all producing identical output.

**Why:** Serves all four personas. Mode A is also the free-tier onboarding path that converts to paid as users gain deal history and move to Mode B.

**Consequences:** Three code paths for ICP generation. Different confidence levels per mode, surfaced explicitly to users.

---

## ADR-006 — Zapier app for non-HubSpot/Salesforce CRMs

**Status:** Accepted

**Context:** 200+ CRMs exist. Building native integrations for each is infeasible.

**Decision:** Native integrations for HubSpot (MVP) and Salesforce (v1.1). One Zapier app for everything else.

**Why:** One Zapier integration covers 200+ CRMs with ~1 week of work. Users build the Zap themselves. Engineering cost per additional CRM is zero.

**Consequences:** Slightly higher setup friction for Zapier users. Real-time sync depends on Zapier uptime. Field mapping UI must handle arbitrary input.

---

## ADR-005 — Dedicated CRM Sync engine, not per-engine CRM writes

**Status:** Accepted

**Context:** Many engines need to write to the CRM. If each writes independently, they collectively blow through HubSpot rate limits and duplicate token-refresh logic.

**Decision:** All CRM writes go through Engine 10 (CRM Sync). Other engines publish events; Engine 10 batches and writes.

**Why:** Centralised rate limiting, one place for token refresh and encryption, complete audit log, and isolation of CRM latency from the rest of the pipeline.

**Consequences:** Engine 10 is a critical path for all CRM persistence. Must be highly reliable with dead-letter queue and retry.

---

## ADR-004 — Supabase for DB + Auth + RLS

**Status:** Accepted

**Context:** Need Postgres, auth, and multi-tenant isolation.

**Decision:** Supabase managed Postgres + Auth + Row Level Security.

**Why:** RLS enforces tenant isolation at the database level, not just application level — a bug cannot leak cross-workspace data. Auth and migrations included. $25/month covers MVP.

**Consequences:** Supabase is a critical dependency. RLS policies must be written carefully.

---

## ADR-003 — Verify-before-publish for every engine

**Status:** Accepted

**Context:** In a pipeline, a half-finished job that publishes a success event corrupts everything downstream.

**Decision:** Every engine runs an explicit task completion check before publishing its success event. If the check fails, it publishes an error event instead.

**Why:** A failed job that reports failure is recoverable. A half-finished job that reports success silently corrupts the pipeline and is very hard to debug.

**Consequences:** Each engine doc defines its completion check. Slightly more code per engine. Worth it.

---

## ADR-002 — Correlation IDs through the whole pipeline

**Status:** Accepted

**Context:** Debugging a distributed event-driven system is very hard without tracing.

**Decision:** Generate a correlation_id when a user triggers an ICP build. Pass it through every downstream event.

**Why:** Lets you trace any problem at step 8 back to the exact ICP build, TAM job, and enrichment batch that caused it.

**Consequences:** Every event payload must carry correlation_id. Enforced in the event publisher utility.

---

## ADR-001 — TypeScript everywhere, Next.js full-stack

**Status:** Accepted

**Context:** Small team, need speed and few moving parts for MVP.

**Decision:** TypeScript across the whole stack. Next.js full-stack (frontend + API routes). Vercel deployment.

**Why:** One language, shared types between frontend and backend prevent contract drift. Next.js + Vercel is the fastest path to a deployed full-stack app. Migration to separate services is clean later (see ADR-012).

**Consequences:** Long-running jobs need Vercel Background Functions, not standard serverless functions.
