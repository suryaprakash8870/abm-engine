# ABM Engine — How it's built & deployed (simple version)

> A plain-English explainer to walk someone through the system without the deep technical detail. For the full version see the deployment-architecture doc.

---

## What it is, in one line

An account-based-marketing platform built as **11 small "engines"** that pass work to each other — like an **assembly line** that turns "who do we want as a customer?" into "here's exactly who to contact and when."

---

## The tech stack — what we used and why

| Part | What we used | Why (in plain words) |
|---|---|---|
| The app + screens | **Next.js (React)** | One tool builds both the dashboard and the behind-the-scenes API — faster to build, fewer moving parts. |
| The database | **PostgreSQL** | Reliable, battle-tested storage for all accounts, contacts, scores, and deals. |
| The "conveyor belt" | **Redis + BullMQ** | Passes messages between the 11 engines so each one reacts to the one before it. |
| The brain (AI) | **Ollama (local) or Claude (cloud)** | Runs AI on our own machine for **free** by default; can switch to the cloud when needed. |
| The language | **TypeScript** | One language everywhere, with safety checks that catch mistakes before they ship. |
| Hosting | **Render (today)** | Runs the whole thing — app, database, and queue — on one platform; can move anywhere later. |

---

## Why 11 separate engines? (the key idea)

Think of a **restaurant kitchen**. Instead of one cook doing everything, there are stations — one chops, one grills, one plates. Each does **one job well** and hands off to the next.

Our system is the same:

```
ICP → find companies → enrich → score → target list → contacts →
signals → awareness → fire the play → write to CRM → learn from wins
```

**Why split it up:**
- 🛡️ If one engine breaks, the others keep running.
- ⚡ We can speed up just the busy engine without touching the rest.
- 👥 Different people can work on different engines at the same time.
- 🔌 We can swap a tool inside one engine without rewriting everything.

**Important:** it's still **one app, one codebase** — just neatly organised into 11 parts. (It's a "modular" build — *not* 11 separate websites.)

---

## What you need to run it (the ingredients)

Five things, that's it:

1. **A web server** — runs the app and screens.
2. **A worker** — does the background "thinking" (scoring, AI, etc.).
3. **A database** (PostgreSQL) — stores everything.
4. **A queue** (Redis) — the conveyor belt between engines.
5. **An AI** — either local (Ollama) or an Anthropic key.

On the cheapest setup, the *web server* and *worker* run together in one place. For heavy use, you split them apart.

---

## How to deploy it (3 steps)

1. **Put the code on GitHub.**
2. **Connect it to a host** (like Render) — it automatically sets up the app, the database, and the queue.
3. **Add your keys** (AI, Apollo, HubSpot, etc.) — and it's live.

That's the whole flow. No servers to hand-configure.

---

## The outside tools it plugs into

The system is the "brain"; it connects to specialist tools for the data (you bring your own account/key for each):

| To do this… | …it uses |
|---|---|
| Find matching companies | Apollo, Ocean.io |
| See which company visited your site | RB2B, Warmly |
| Know their tech + buying intent | BuiltWith, Bombora, TheirStack |
| Your system of record (CRM) | HubSpot, Salesforce |
| Reach out | LinkedIn (HeyReach), Email (Instantly) |
| Alerts | Slack / Telegram |

Each is optional — plug in only the ones you want, and the rest run on sample data until you do.

---

## From demo to a real production setup

Right now it runs on **free, temporary** infrastructure to keep costs at zero while we build and demo. To run it for real customers, you upgrade each piece to a proper, always-on version — **the code stays exactly the same**, you just swap free services for paid ones.

| Piece | Now (free demo) | Later (real production) |
|---|---|---|
| Web address | a shared `onrender.com` link | **your own domain** (e.g. `app.yourcompany.com`) with HTTPS |
| Web server | free (goes to sleep when idle → slow first load) | **paid, always-on** server (Render / AWS / GCP) |
| Worker (background brain) | runs inside the web app | its **own dedicated** always-on process |
| Database | free Postgres (wiped after ~30 days) | **managed PostgreSQL with daily backups** (Supabase / AWS RDS) |
| Queue (Redis) | free 25 MB | managed Redis with persistence |
| AI | local Ollama via a tunnel from a laptop | an Anthropic key, **or** Ollama on a real GPU server |
| Keys & secrets | test keys | production keys kept in a secrets manager |
| Monitoring | none | error tracking + uptime alerts |

**What the customer notices after the upgrade:** a real web address, it's **always on** (no slow first load), data is **safely backed up**, and it can handle **many real users at once**.

> In short: going from demo to production is mostly **swapping free, temporary services for paid, always-on ones** — plus pointing it at your own domain. No rewrite.

---

## One-line summary

> **It's one app, organised as 11 cooperating engines, that runs on a web server + worker + database + queue + an AI — deployed by pushing code to a host and adding your keys. Today it runs free for demos; for real use you swap in a paid server, your own domain, and a backed-up database.**
