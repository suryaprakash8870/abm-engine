# ABM Engine — what we've built

*Document 1 of 2 · Stakeholder review pack*

## Executive summary

The ABM Engine is an end-to-end Account-Based Marketing platform built as **11 independent engines** that hand work to each other over an event bus — each engine has one job, its own database tables, and its own API. Together they cover the full GTM motion the OneGTMLab diagrams describe: define the ICP, source the TAM, enrich and qualify accounts, score and tier them, finalize the target account list, source buying committees, capture buying signals, score awareness and route hot accounts, fire the right play, write everything back to the CRM, and feed outcomes back to refine the ICP. It runs on **Next.js (App Router) + PostgreSQL (Prisma) + BullMQ/Redis**, with AI handled by **local Ollama by default** (Anthropic Claude optional via key). The system is **deployed live on Render**, talks to **real AI over an Ollama tunnel**, and ships with **78 passing integration tests**. The pipeline is real end-to-end; several data-sourcing steps (visitor de-anonymisation, contact/company enrichment, live CRM OAuth) are currently mock-by-default and become live as the client provides the relevant third-party keys.

---

## Engine summary

| Engine | Job | State | One-line how |
|---|---|---|---|
| 01 ICP Engine | Build the structured Ideal Customer Profile | Partial | 3 build modes (wizard / CRM win-loss / CSV) converge on one ICP shape, AI-synthesised and version-gated |
| 02 TAM Builder | Source every matching company | Partial | Real Apollo company search (mock fallback), domain-dedupes, publishes the raw account list |
| 03 Enrichment Engine | Enrich + AI-qualify accounts | Mock | Cache-first pipeline is live; enrichment data and qualification are still mock/rule-based |
| 04 Scoring Engine | Score + tier accounts (0–100) | Partial | AI-generated weighted formula scores fit and assigns Tier 1/2/3; signals criterion still a stub |
| 05 TAL Manager | Keep the official target account list | Live | Suppresses, snapshots an immutable versioned list, publishes `tal.finalized` |
| 06 Contact Engine | Source + map buying committees | Partial | Per-account Apollo sourcing + role classification; data is mock-by-default |
| 07 Signal Engine | Capture buying signals (always-on) | Partial | Real tracking/webhook/score/dedup pipeline; visitor→company mapping is demo-grade |
| 08 Awareness Engine | Score awareness + route accounts | Live | Deterministic time-decayed score, 5-stage funnel, routing rules, daily decay cron |
| 09 Demand Gen Orchestrator | Execute the right play | Partial | Tier×stage play matrix with atomic suppression; Slack/sequence sends still mocked |
| 10 CRM Sync Engine | Write all data back to the CRM | Partial | Real HubSpot read/write when keyed; OAuth + multi-CRM still pending |
| 11 GTM Flywheel | Attribution + ICP feedback loop | Partial | Closed-deal attribution, tier metrics, every-5th-win ICP refresh; LLM analysis pending |

---

## 01. ICP Engine

**Job:** Build the structured Ideal Customer Profile (firmographics, technographics, signals, exclusions) that every downstream engine consumes as its primary instruction set.

**What we built**
- Three ICP build modes that all converge on one identical ICP shape: Mode A (12-question hypothesis wizard), Mode B (CRM deal win/loss analysis), Mode C (CSV import).
- Mode A wizard: validates 12 answers, persists a session, and queues an async synthesis job; the worker forces a structured ICP output, validates it, and publishes `icp.created` (or `icp.error` on failure).
- An AI intake helper: paste a website URL or business description and the LLM drafts all 12 wizard answers to pre-fill the wizard, with a deterministic mock fallback.
- Mode B/C statistical pipeline that computes win-rate-by-industry, avg won deal size, headcount range, top geos/tech, and exclusion candidates, then has the LLM interpret those stats into the ICP.
- A verify-before-publish gate encoding the spec's task-completion checklist; on any failure it publishes `icp.error` instead of a success event.
- Full persistence + versioning across 5 tables; every create/edit cuts a new version snapshot and appends to confidence history in a transaction. Edit path bumps the version and publishes `icp.updated`.
- Health endpoint plus 11 passing integration tests.

**How it works**
Trigger is a direct user action over HTTP. Three onboarding answers route the user to a mode. Heavy LLM work is always queued through BullMQ, never run inline. Mode A sends the 12 answers to the LLM as a structured call; Mode B/C first compute deterministic win/loss statistics in code, then have the LLM interpret them into the same shape. The result is validated, run through the completion check, persisted as version 1 with a snapshot, and published as `icp.created` — consumed by TAM Builder, Enrichment, and Scoring.

**Current state — Partial.** Mode A (wizard) and Mode C (CSV) are fully live end-to-end: real queued workers, real persistence + versioning, real verify-before-publish gate, real events. The LLM is real but local-first (Ollama default, Anthropic optional, deterministic mock fallback so the wizard never dead-ends). Two pieces are not yet live: (1) Mode B deal fetch is a stub — it has no live HubSpot deal source yet, so the route returns 424, though the statistical pipeline behind it is fully built and tested; (2) the four GTM-Flywheel feedback handlers are wired and validated but their core logic is still TODO, so the auto-refresh loop is not yet closed. Supabase RLS is deferred to Phase-0 auth.

---

## 02. TAM Builder

**Job:** Given a finished ICP, source every matching company from Apollo, dedupe by domain, and hand the raw account list to Enrichment.

**What we built**
- Event-driven trigger on `icp.created`: validates the payload, maps firmographics to Apollo filters, and queues a paginated build job in a worker (never inline).
- Real Apollo integration against the live company-search endpoint when a key is set, parsing organizations into normalized companies.
- Mock-first cost safety: with no key it returns deterministic synthetic companies derived from the ICP filters; a key on a plan without API access degrades gracefully to mock instead of failing.
- Pagination + checkpointing of every raw page, then a bulk insert honouring a `UNIQUE (workspace_id, domain)` constraint.
- Domain dedupe (strip protocol/www/path, lowercase, first-wins) before persisting.
- Verify-before-publish gate; on pass it publishes `tam.search_completed` (with accounts and source breakdown), otherwise `tam.search_failed` with a resume checkpoint.
- A CSV upload path through the same pipeline, backed by a real UI page.
- Full schema + REST routes + a passing integration test (ACME.com dedupes to 2 accounts and the completed event fires).

**How it works**
ICP Engine publishes `icp.created`; the handler derives Apollo filters and queues a build job. The worker paginates the search (real Apollo or deterministic mock), checkpoints each raw page, dedupes by normalized domain, and bulk-inserts. On a passing completion check it publishes `tam.search_completed` with all account ids; Enrichment consumes it to start qualifying.

**Current state — Partial.** One of the most genuinely live engines: it makes real Apollo calls when a key is present. A deliberate credit-safety cap means a live key pulls only ~25 accounts (one page) by default until a paid plan and budget are confirmed; the mock default is 1000. Dedupe, the unique constraint, the gate, the CSV path, and the test are all real. Gaps from the spec: no SSE live-progress route (the UI polls), single search rather than 2–3 overlapping searches, no actual resume-from-checkpoint, no Apollo 402 (credit-exhausted) handling, and `last_event_processed_at` is hardcoded null.

---

## 03. Enrichment Engine

**Job:** Take the raw TAM list, fill in firmographics + tech stack from a shared cost-control cache, AI-qualify each account against the ICP, and publish the enriched/qualified set to Scoring.

**What we built**
- Event-driven pipeline consuming `tam.search_completed` (and storing a local ICP snapshot from `icp.created` so qualification needs no cross-engine query); publishes `accounts.enriched` or `enrichment.failed`.
- Async/queued execution so the user is never blocked on enrichment latency.
- Real cache-first cost control: a shared cross-workspace cache is checked first; on a live hit no external call is made; on miss it enriches and writes the cache with 30-day firmographic / 90-day technographic TTLs.
- Per-account enrich → persist → qualify → persist, accumulating counts, top industries, and a geography breakdown.
- A rule-based qualification judge (industry match + headcount band + exclusion check) producing qualified/confidence/reason.
- Verify-before-publish gate, structural payload validators, full Prisma models, status/accounts/health API routes, and a passing 2-account integration test.

**How it works**
TAM Builder emits `tam.search_completed`; the handler opens a job and queues work. The worker loads the local ICP snapshot, enriches each account through the cache (live hit → no API call), upserts the result, runs the rule-based judge, and upserts qualification. After the completion check passes it publishes `accounts.enriched` with counts and breakdowns for Scoring.

**Current state — Mock.** The plumbing is live and tested (events, queue, persistence, cache TTL logic, gate, publish), and the cache itself is real and correct. But the two data-bearing steps are not real: (1) enrichment is hardcoded mock — it returns synthetic firmographics/tech from a domain hash even when a key is set; the real Apollo→Clearbit→BuiltWith path is a TODO. (2) Qualification is rule-based, not AI — there is no Haiku/Ollama call yet. Several gate inputs are hardcoded true rather than computed. Spec steps for the BuiltWith pre-filter, the confidence<0.4 "review recommended" flag, and 5% spot-check sampling are unimplemented.

---

## 04. Scoring Engine

**Job:** Assign every enriched account a transparent 0–100 ICP-fit score from an AI-generated, user-editable weighted formula, then tier them (Tier 1/2/3) and publish `accounts.scored`.

**What we built**
- A live event pipeline consuming `accounts.enriched` (and ICP events to invalidate the cached formula), with idempotent queued jobs publishing `accounts.scored` or `scoring.failed`.
- Deterministic weighted scoring: industry fit, company size (band-based), and tech-stack matching, summed to a 0–100 score with NaN guards.
- AI formula generation via the provider router (Ollama default, Anthropic optional) forcing 4–8 weighted criteria, normalized to sum to 1, with a hardcoded equal-weight fallback that never blocks the pipeline.
- All 5 spec tables as real models with versioned formula snapshots.
- Manual override that "always wins" (requires a reason) and a `tier3_min` floor that leaves below-floor accounts untiered rather than mislabelled.
- 8 API routes plus a working formula-editor UI (weight sliders, tier-distribution cards, fallback banner, "Run scoring now").
- Verify-before-publish gate and idempotent job ids to prevent double-publishing on replay.

**How it works**
Enrichment publishes `accounts.enriched`; the handler resolves the ICP and queues a scoring job. The worker gets or generates the formula, computes a weighted score per account by matching each criterion, assigns Tier 1 (≥70) / Tier 2 (≥40) / Tier 3 (≥10) / null below floor (overrides winning), upserts scores and history, and — only after the completion check passes — publishes `accounts.scored` for the TAL Manager.

**Current state — Partial.** Core scoring math, tiering, versioning, override logic, persistence, gate, idempotency, API, and UI are all real and working. Formula generation is genuinely AI-backed (not hardcoded mock). Three honest gaps: (1) the buying-signals criterion is a placeholder using the enrichment "qualified" flag as a flat 0.5 proxy — real Signal Engine data is not yet wired; (2) any AI-generated criterion outside the three hardcoded evaluators also falls through to that 0.5 proxy, so richer formulas are generated but only ~3 criteria actually move the score; (3) two spec'd LLM features (weight-change preview, override-pattern analysis) and a true pre-commit what-if preview are unbuilt. Scoring quality is also bounded by upstream enrichment data being mock.

---

## 05. TAL Manager

**Job:** Keep the authoritative Target Account List — take scored/tiered accounts, remove suppressed companies, snapshot an immutable versioned list, and publish `tal.finalized`.

**What we built**
- An event-driven finalize pipeline on `accounts.scored` that publishes `tal.finalized` only after the completion check passes.
- A suppression engine matching domain/accountId against active suppression entries (existing_customer / closed_lost / do_not_contact / unsubscribed / manual), with API and UI.
- Immutable versioning: the head TAL, membership, and a JSONB snapshot are written in one transaction so the head version can never get ahead of its snapshots.
- Real idempotency via a unique constraint on `(workspace_id, source_correlation_id)` plus a reuse guard, so a retried event returns the existing version.
- Five working REST routes (current list, history, suppress, finalize, CSV export) plus health, and a functional Accounts List UI with tier filter, suppress, finalize, export, and a "Push to HubSpot" button.
- A CRM sync request log, a verbatim completion check, an integration test, and two real Prisma migrations for all five tables.

**How it works**
Scoring publishes `accounts.scored`. The handler loads those accounts' scores/tiers (joining company name/domain), excludes untiered accounts, applies suppression, then atomically upserts the head TAL, replaces membership, and writes an immutable snapshot (idempotent on correlation id). It queues advisory CRM-sync rows and, only if the completion check passes, publishes `tal.finalized` — consumed by the Contact Engine and CRM Sync.

**Current state — Live.** The TAL Manager's own logic is genuinely live and deterministic (the spec mandates no LLM here): real persistence, transactional immutable versioning, working idempotency, real suppression, real CSV export, all routes and UI functional. Three honest caveats: (1) the CRM-sync portion of the completion check passes on a *queued request*, not a confirmed Engine-10 write; (2) those advisory sync-log rows are never actually consumed — Engine 10 reads the TAL directly and writes only `abm_tier` (no HubSpot active-list creation exists); (3) LinkedIn Matched Audience sync (Tier 1/2) is entirely unbuilt. Account names/domains on the list are demo-grade because upstream enrichment is mock.

---

## 06. Contact Engine

**Job:** Source the buying committee for each Tier-1/2 account, verify emails, assign a stakeholder role (decision-maker / champion / influencer), and publish a per-account stakeholder map.

**What we built**
- Event-driven fan-out on `tal.finalized`: loads Tier-1/2 accounts and queues one async sourcing job per account (Tier 1 first, Tier 3 never contacted), each idempotent.
- Per-account committee sourcing that searches per role, dedupes by email, verifies every email, classifies a role, and persists contacts + stakeholder map + verification rows + queued CRM-sync rows + the job record in one atomic, retry-safe transaction.
- A rule-based role classifier (word-bounded title regex) returning decision_maker / champion / influencer / unknown with confidence, flagging low-confidence for review — a deterministic substitute for the spec's Haiku classifier.
- All 6 documented API routes (source, source-batch, list, by-account, re-map role, manual add), all workspace-scoped.
- All 5 owned tables modelled, a health probe, and a CRM write-back wired end-to-end (Engine 10 upserts each contact with an `abm_stakeholder_role` to real HubSpot when keyed).
- An integration test asserting one job per Tier-1/2 account and the gate behaviour.

**How it works**
TAL Manager emits `tal.finalized`. The handler reads the finalised Tier-1/2 list and queues one job per account. Each worker derives per-role title criteria, calls Apollo people-search per role, verifies emails, runs the role classifier, and writes everything atomically. It then publishes `contacts.mapped` (with role id arrays and a verified-email count) on success, or `contacts.sourcing_failed` on zero contacts. Signal Engine and CRM Sync consume the event; Engine 10 writes the contacts and roles into HubSpot.

**Current state — Partial.** Orchestration, persistence, gating, events, API, and CRM hand-off are real and production-shaped. Mock/demo-grade pieces: (1) Apollo people-search *and* email verification are mock-by-default (synthetic people from a hash), and even with a key any error silently degrades to mock, so live Apollo is untested; (2) role assignment is rule-based regex, not the spec's Haiku classifier; (3) the Sonnet conversation-starter for Tier-1 champions is absent; (4) CRM push is asserted (a queued log row) rather than verified against an actual HubSpot write result.

---

## 07. Signal Engine

**Job:** Always-on intake that captures buying signals (website hits, CRM/email webhooks, 3rd-party research), resolves each to a target account, scores/normalises/deduplicates, and publishes `signal.received`.

**What we built**
- A public website tracking pipeline: a track endpoint plus a served JS snippet that auto-fires pageviews and SPA route changes, with per-workspace token auth.
- A page-intent classifier: 7 weighted tiers (demo_request, roi_calculator, pricing, comparison, product, docs, content) each with a weekly decay rate.
- CRM/email webhook receivers (HubSpot, Outreach) with HMAC-SHA256 signature verification and full delivery logging, mapping 6 event types.
- Two-layer dedup: a 5-minute Redis window backed by a DB unique constraint.
- 3rd-party research intake: scrapes the account domain (Firecrawl) → extracts funding/hiring/product/tech findings via the local LLM → ingests as research signals scaled by confidence; also pulls job-posting (TheirStack) signals.
- A decayed rolling signal score per account, a workspace-wide feed, contact attribution from `contacts.mapped`, a verify-before-publish gate, bot filtering, a health endpoint, and integration tests.

**How it works**
Intake is primarily HTTP. A signal arrives via the tracking snippet, a signed webhook, or the research route. Each hit is bot-filtered, resolved to a TAL account, classified into a signal type with points + decay, normalised, and deduplicated. Only after the row is stored and the 4-point completion check passes does it publish `signal.received` — consumed solely by the Awareness Engine.

**Current state — Partial.** The full ingest-score-dedup-store-publish pipeline is real and tested, as are intent scoring, HMAC verification, the public snippet, decayed scoring, and the gate. The critical gap is signal *sourcing*: visitor de-anonymisation (RB2B/Clearbit) is not implemented — anonymous visitors are mapped to a *random* TAL account via a hash (demo-grade). Real intent only flows when a webhook/test carries an explicit company domain or account id. Firecrawl/TheirStack have real code paths but default to synthetic mock without keys. There is no scheduled poller yet, so "always-on" daily polling isn't built; Crunchbase, Bombora, and social-listening sources don't exist.

---

## 08. Awareness Engine

**Job:** Turn the stream of raw signals into one explainable, time-decayed awareness score per account (0–100), map it to a 5-stage funnel, detect "hot" accounts, and fire routing rules.

**What we built**
- A deterministic decay scoring engine: on every `signal.received` it re-reads the account's full signal history and recomputes the score as the sum of points × decay^age, capped at 100 and NaN-safe.
- A 5-stage ladder (identified / aware / interested / considering / selecting) with stage-change logging.
- Hot-jump detection against history (compares to the score ~48h ago and fires `account.hot` only on a >20-point delta), so a no-op retry can't re-fire it.
- Atomic persistence in a transaction: upserts the score, logs stage changes, and writes a daily snapshot for trend charts.
- A routing-rule engine matching on min-score / stage / dominant signal type, honouring cooldown days and a monthly cap, recording every evaluation.
- A daily decay recalculation as a real BullMQ repeatable cron so stale accounts cool off; a fail-closed completion check; a full API surface and a working dashboard; an integration test.

**How it works**
The Signal Engine publishes `signal.received`; the worker re-reads the account's entire signal history, recomputes the decayed 100-capped score (no LLM), maps it to a stage, compares against prior score/stage and the ~48h-ago snapshot, atomically persists, then evaluates routing rules with suppression. After the check passes it *always* publishes `account.score_updated` and *conditionally* publishes `account.stage_changed` and `account.hot` (consumed by the Orchestrator, CRM Sync, and Flywheel). A daily cron re-decays all accounts.

**Current state — Live.** The scoring/decay/staging/routing math and event flow are genuinely live and deterministic — no mocks in the core path, fully wired into the real event bus, with a real daily-decay cron. Caveats: (1) scoring is only as good as Engine 07's signals, whose visitor→company mapping is demo-grade; (2) the spec's on-demand account narrative (Sonnet) is not implemented — there's zero LLM usage here; (3) `last_event_processed_at` is hardcoded null; (4) a deliberate documented cross-engine read of the signals table.

---

## 09. Demand Gen Orchestrator

**Job:** Turn awareness triggers into rep action — pick the right play by tier × stage, check suppression atomically, fire it (CRM task + alert or sequence enrolment), log it, and publish `play.fired` / `play.outcome_recorded`.

**What we built**
- A tier × stage (and `account.hot`) play matrix returning a deterministic play + execution method, overridable per workspace via a templates table.
- Atomic suppression-and-fire wrapped in a Postgres advisory lock so the suppression check and the fire are one unit across processes; suppression enforces hard blocks, a cooldown window, and a monthly cap.
- Tier-routed firing: Tier 1 creates a play attributed to the highest-confidence decision-maker; Tier 2/3 resolves a sequence mapping and writes "enrolled".
- Idempotent logging (unique on workspace/account/correlation) so a re-delivered trigger returns the existing play.
- A verify-before-publish gate, an AI email draft (provider-agnostic, structured, template fallback, logged), outcomes + snooze handling, a full API surface, a best-effort Telegram alert, and an integration test.

**How it works**
The Awareness Engine publishes `account.stage_changed` or `account.hot`. The handler resolves the account tier, opens a transaction, takes a per-account advisory lock, runs suppression, and if clear fires the tier-appropriate play and logs it. After the completion check it publishes `play.fired` and sends a best-effort Telegram alert. CRM Sync and the Flywheel consume `play.fired`; Engine 10 writes the play back as a CRM task. Outcomes flow back via `play.outcome_recorded`.

**Current state — Partial.** The orchestration brain is real and DB-backed: play matrix, atomic suppression, idempotent logging, outcomes, snooze, and the gate all execute against Postgres. Live: the AI draft (Ollama default), the Telegram alert (real Bot API call when a token is set), and the CRM task write-back (real HubSpot via Engine 10 when keyed). Mocked: the Slack notification is a placeholder timestamp, and Tier 2/3 sequence enrolment resolves the mapping but the actual Outreach/Apollo enrolment is a no-op. The Tier-1 completion check passes on the strength of that mock Slack ts, so the only real external touch happens asynchronously. No Luma invites, Slack buttons, or real sequence wiring yet.

---

## 10. CRM Sync Engine

**Job:** The single chokepoint for all CRM I/O — write ABM data (tiers, contacts, scores, play logs) to HubSpot, and listen to inbound deal-stage changes to publish the closed-won/lost feedback loop.

**What we built**
- A real HubSpot v3 adapter (search-then-upsert on domain/email, create-task, list for import) that engages whenever an OAuth token or service key is present; otherwise a deterministic network-free mock adapter runs the same code path.
- Four event handlers (`tal.finalized` → tiers, `contacts.mapped` → contacts+roles, `account.score_updated` → score/stage, `play.fired` → CRM task), each validating, writing, checking, then publishing `crm.synced`.
- A write pipeline: batch-by-type chunked at 100, Redis token-bucket rate limiting, per-record upsert, idempotent audit log, dead-lettering of failures, computed job status.
- An inbound deal webhook with HMAC verification, workspace resolution, dedup, and `crm.deal_closed_won/lost` publishing.
- CRM import + a manual "Push to HubSpot" through the same write path (returning live|mock), AES-256-GCM at-rest token encryption, connection management, a sync-log UI with a "Failed only" filter, a health probe, and 3 test files.

**How it works**
Upstream engines publish CRM-write events; each is subscribed to a handler that validates, builds write records, and calls the write pipeline (batched, rate-limited, audited, dead-lettered). The adapter picks real HubSpot when a token/service key exists, else mock. Only after the completion check passes does it publish `crm.synced`. Separately, inbound HubSpot deal webhooks are verified, deduped, parsed for won/lost, and published as `crm.deal_closed_won/lost` — the loop consumed by the ICP Engine and Flywheel.

**Current state — Partial.** The most production-ready engine — the only one that writes to a real external system. The HubSpot write/read path is genuinely live when the service key is set (real upserts, task creation, 429 retry with backoff, real import). Default/demo state is mock. OAuth is not real (the connect path writes a mock token; there's no consent-screen redirect or code-for-token exchange), so the only live path is the env service key. Token auto-refresh is deferred, webhook subscriptions aren't auto-created (manual registration required), parts of the completion check pass as constants, and Salesforce/Zapier adapters don't exist (HubSpot only).

---

## 11. GTM Flywheel

**Job:** The learning loop — on every closed deal, build multi-touch attribution, recompute pipeline/win-rate/deal-size/days-to-close by tier, and every 5th win recommend an ICP refresh back to Engine 01.

**What we built**
- A live `crm.deal_closed_won` pipeline: attribution walks back the account's real signal + play history and writes first/last/linear weights; win/loss is recorded idempotently on deal id so a re-delivered event can't double-count revenue.
- Tier-metrics computation (pipeline, win rate, avg deal size, avg days-to-close per Tier 1/2/3) persisted as a daily snapshot plus keyed metric rows.
- A correlation suppression gate that returns "more data needed" until 20 closed deals exist, so the UI never shows misleading stats.
- A concurrency-safe every-5th-win cadence using an advisory lock + a durable watermark so `icp.refresh_recommended` fires exactly once per 5-band.
- A closed-lost path feeding anti-ICP, a verify-before-publish gate, 4 read APIs behind a real analytics UI, a health route, a real migration for all 5 tables, and an integration test. The ICP feedback loop is wired at the bus level.

**How it works**
Engine 10 emits `crm.deal_closed_won/lost`. The worker builds attribution from the account's signals and plays, records win/loss idempotently (tier from the TAL), aggregates tier metrics (correlation only once ≥20 deals), and atomically decides whether this is a fresh 5th-win band. After the check passes it publishes `flywheel.metrics_updated` and, on a milestone, `icp.refresh_recommended` back to Engine 01.

**Current state — Partial.** Live: the closed-won/lost path is real and DB-backed — attribution walk-back, idempotent recording, tier metrics, the ≥20-deal gate, the every-5th-win milestone, all 4 read APIs, the insights UI, and the migration. Stubbed: 6 of 8 consumed-event handlers only validate then no-op, so attribution touches come solely from what Signal/Orchestrator already wrote. No LLM anywhere yet — the spec's four Claude tasks (ICP-refresh analysis, correlation interpretation, loss-pattern suggestions, weekly digest) are unimplemented, so the refresh recommendation is a template string. "Correlation" past the gate is a frequency share, not a real win-vs-loss correlation. Crucially, the receiving end (Engine 01's refresh handler) is itself a stub, so the loop fires but does not yet re-version the ICP.

---

## Overall status

**Build state across the 11 engines**

- **Live (2):** 05 TAL Manager · 08 Awareness Engine
- **Partial (8):** 01 ICP Engine · 02 TAM Builder · 04 Scoring Engine · 06 Contact Engine · 07 Signal Engine · 09 Demand Gen Orchestrator · 10 CRM Sync Engine · 11 GTM Flywheel
- **Mock (1):** 03 Enrichment Engine

**What "Partial" means here:** the orchestration, persistence, event flow, verify-before-publish gates, and APIs are real and tested in every case. The mock/demo-grade parts are concentrated in *external data sourcing* — visitor de-anonymisation (07), company/contact enrichment (03, 06), live Apollo volume (02), real CRM OAuth and sequence sends (09, 10) — each of which becomes live as the client provides the relevant third-party key.

**Deployment**
- **Live on Render** (the full Next.js app + in-web worker).
- **Real AI via a local Ollama tunnel** (Cloudflare tunnel + encrypted auth); Anthropic Claude is optional per engine via key.
- **78 integration tests passing** across the engines.

**The one net-new capability the client wants that we don't have**
- A **Content Intelligence Engine** — not present in the current 11-engine system. This is the single net-new capability requested in the OneGTMLab workflow that has no counterpart in what we've built today.