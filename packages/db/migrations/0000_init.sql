-- ─────────────────────────────────────────────────────────────
-- 0000_init.sql — initial schema for the ABM Engine.
-- Multi-tenancy: every tenant-scoped table carries org_id, and RLS
-- enforces isolation. The API sets `app.current_org_id` per request
-- (see CurrentOrgInterceptor in apps/api).
-- ─────────────────────────────────────────────────────────────

create extension if not exists "pgcrypto";

-- ── organizations ──
create table "organizations" (
  "id" uuid primary key default gen_random_uuid(),
  "name" text not null,
  "slug" text not null unique,
  "created_at" timestamptz not null default now(),
  "updated_at" timestamptz not null default now()
);

-- ── users ──
create table "users" (
  "id" uuid primary key default gen_random_uuid(),
  "org_id" uuid not null references "organizations"("id") on delete cascade,
  "supabase_user_id" uuid not null unique,
  "email" text not null,
  "role" text not null default 'member' check ("role" in ('owner','admin','member')),
  "created_at" timestamptz not null default now(),
  "updated_at" timestamptz not null default now()
);
create index "users_org_id_idx" on "users" ("org_id");

-- ── crm_connections ──
create table "crm_connections" (
  "id" uuid primary key default gen_random_uuid(),
  "org_id" uuid not null references "organizations"("id") on delete cascade,
  "provider" text not null check ("provider" in ('hubspot','salesforce')),
  "access_token_encrypted" text not null,
  "refresh_token_encrypted" text,
  "expires_at" timestamptz,
  "external_account_id" text,
  "created_at" timestamptz not null default now(),
  "updated_at" timestamptz not null default now()
);
create index "crm_connections_org_id_idx" on "crm_connections" ("org_id");
create unique index "crm_connections_org_provider_uq" on "crm_connections" ("org_id","provider");

-- ── icp_rubrics ──
create table "icp_rubrics" (
  "id" uuid primary key default gen_random_uuid(),
  "org_id" uuid not null references "organizations"("id") on delete cascade,
  "version" integer not null default 1,
  "name" text not null,
  "weights" jsonb not null,
  "created_at" timestamptz not null default now()
);
create index "icp_rubrics_org_id_idx" on "icp_rubrics" ("org_id");

-- ── accounts ──
create table "accounts" (
  "id" uuid primary key default gen_random_uuid(),
  "org_id" uuid not null references "organizations"("id") on delete cascade,
  "domain" text not null,
  "name" text,
  "external_crm_id" text,
  "external_crm_provider" text check ("external_crm_provider" in ('hubspot','salesforce')),
  "enrichment" jsonb,
  "enriched_at" timestamptz,
  "created_at" timestamptz not null default now(),
  "updated_at" timestamptz not null default now()
);
create index "accounts_org_id_idx" on "accounts" ("org_id");
create unique index "accounts_org_domain_uq" on "accounts" ("org_id","domain");
create index "accounts_external_crm_idx" on "accounts" ("org_id","external_crm_provider","external_crm_id");

-- ── contacts ──
create table "contacts" (
  "id" uuid primary key default gen_random_uuid(),
  "org_id" uuid not null references "organizations"("id") on delete cascade,
  "account_id" uuid references "accounts"("id") on delete set null,
  "email" text,
  "phone" text,
  "first_name" text,
  "last_name" text,
  "title" text,
  "role" text default 'unknown' check ("role" in ('influencer','decision_maker','champion','unknown')),
  "external_crm_id" text,
  "external_crm_provider" text check ("external_crm_provider" in ('hubspot','salesforce')),
  "created_at" timestamptz not null default now(),
  "updated_at" timestamptz not null default now()
);
create index "contacts_org_id_idx" on "contacts" ("org_id");
create index "contacts_account_idx" on "contacts" ("org_id","account_id");
create unique index "contacts_org_email_uq" on "contacts" ("org_id","email");

-- ── signals ──
create table "signals" (
  "id" uuid primary key default gen_random_uuid(),
  "org_id" uuid not null references "organizations"("id") on delete cascade,
  "account_id" uuid references "accounts"("id") on delete cascade,
  "contact_id" uuid references "contacts"("id") on delete set null,
  "type" text not null,
  "party" text not null check ("party" in ('first','second','third')),
  "source" text,
  "weight" real not null default 1,
  "payload" jsonb,
  "occurred_at" timestamptz not null,
  "ingested_at" timestamptz not null default now()
);
create index "signals_org_id_idx" on "signals" ("org_id");
create index "signals_account_occurred_idx" on "signals" ("org_id","account_id","occurred_at");
create index "signals_type_idx" on "signals" ("org_id","type");

-- ── scores ──
create table "scores" (
  "id" uuid primary key default gen_random_uuid(),
  "org_id" uuid not null references "organizations"("id") on delete cascade,
  "account_id" uuid not null references "accounts"("id") on delete cascade,
  "fit_score" real not null default 0,
  "tier" integer,
  "signal_score" real not null default 0,
  "awareness_stage" text check ("awareness_stage" in ('identified','aware','engaged','considering','selecting')),
  "computed_at" timestamptz not null default now()
);
create index "scores_org_id_idx" on "scores" ("org_id");
create unique index "scores_org_account_uq" on "scores" ("org_id","account_id");
create index "scores_tier_idx" on "scores" ("org_id","tier");

-- ─────────────────────────────────────────────────────────────
-- Row-Level Security policies.
-- The API binds the current org per request via:
--   SET LOCAL app.current_org_id = '<uuid>';
-- Service-role / migration connections bypass RLS naturally.
-- ─────────────────────────────────────────────────────────────

alter table "users"           enable row level security;
alter table "crm_connections" enable row level security;
alter table "icp_rubrics"     enable row level security;
alter table "accounts"        enable row level security;
alter table "contacts"        enable row level security;
alter table "signals"         enable row level security;
alter table "scores"          enable row level security;

-- Force RLS even for table owners (defense in depth).
alter table "users"           force row level security;
alter table "crm_connections" force row level security;
alter table "icp_rubrics"     force row level security;
alter table "accounts"        force row level security;
alter table "contacts"        force row level security;
alter table "signals"         force row level security;
alter table "scores"          force row level security;

-- Generic "you can only see your own org's rows" policy.
-- current_setting(..., true) returns null when unset → access denied.
do $$
declare
  t text;
begin
  foreach t in array array[
    'users','crm_connections','icp_rubrics','accounts','contacts','signals','scores'
  ]
  loop
    execute format($f$
      create policy "%1$s_tenant_isolation" on "%1$s"
        using (org_id::text = current_setting('app.current_org_id', true))
        with check (org_id::text = current_setting('app.current_org_id', true));
    $f$, t);
  end loop;
end$$;
