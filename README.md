# ABM Engine

CRM-agnostic ABM intelligence layer. See [`CLAUDE.md`](CLAUDE.md) for the project brief, [`DECISIONS.md`](DECISIONS.md) for the ADR, and [`TODO.md`](TODO.md) for the phased roadmap.

## Monorepo layout

```
apps/
  web/        Next.js (App Router) — dashboard, auth, marketing
  api/        NestJS — the 5-component engine + workers
packages/
  db/         Drizzle schema + migrations (multi-tenant via org_id + RLS)
  shared/     TypeScript types shared between FE and BE
```

## Phase 0 — local dev quick start

Prerequisites: Node 20+, Docker Desktop.

```bash
# 1. install deps (uses npm workspaces)
npm install

# 2. start Postgres + Redis locally
npm run infra:up

# 3. copy env template
cp .env.example .env   # then fill SECRETS_ENCRYPTION_KEY at minimum

# 4. apply initial schema
npm run db:migrate

# 5. run the API and the web app (separate terminals)
npm run dev:api
npm run dev:web
```

API listens on `http://localhost:4000`. Web app on `http://localhost:3000`.

## Hard rules (from CLAUDE.md)

1. Never build a CRM. Integrate.
2. Never enrich/score inside a web request — always queue (BullMQ).
3. CRM logic only behind the `CrmAdapter` interface.
4. Signals are weighted + time-decayed (1st-party ≫ 3rd-party).
5. Multi-tenancy from day one (`org_id` + RLS).
6. CRM tokens encrypted at rest.
7. CRM write-back is upsert, never overwrite.
8. Don't build the dashboard before the engine works.
