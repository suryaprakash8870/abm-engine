-- 0001 — Phase 2/3/4 columns + orchestrator tables.
-- Adds: org Slack webhook, account source, score stage history,
--       orchestrator_rules + action_log (with RLS, matching 0000's pattern).

-- ── organizations: Slack webhook for orchestrator alerts (Phase 3) ──
alter table "organizations" add column if not exists "slack_webhook_url" text;

-- ── accounts: provenance for TAM-sourced prospects (Phase 4) ──
alter table "accounts" add column if not exists "source" text not null default 'crm'
  check ("source" in ('crm', 'apollo', 'manual'));

-- ── scores: append-only awareness stage history (Phase 2 validation gate) ──
alter table "scores" add column if not exists "stage_history" jsonb;

-- ── orchestrator_rules ──
create table if not exists "orchestrator_rules" (
  "id" uuid primary key default gen_random_uuid(),
  "org_id" uuid not null references "organizations" ("id") on delete cascade,
  "name" text not null,
  "enabled" boolean not null default false,
  "condition" jsonb not null,
  "actions" jsonb not null,
  "created_at" timestamptz not null default now(),
  "updated_at" timestamptz not null default now()
);
create index if not exists "orchestrator_rules_org_idx" on "orchestrator_rules" ("org_id");

-- ── action_log ──
create table if not exists "action_log" (
  "id" uuid primary key default gen_random_uuid(),
  "org_id" uuid not null references "organizations" ("id") on delete cascade,
  "rule_id" uuid references "orchestrator_rules" ("id") on delete set null,
  "account_id" uuid references "accounts" ("id") on delete cascade,
  "action" text not null,
  "status" text not null check ("status" in ('sent', 'failed')),
  "detail" jsonb,
  "created_at" timestamptz not null default now()
);
create index if not exists "action_log_org_idx" on "action_log" ("org_id");
create index if not exists "action_log_rule_account_idx"
  on "action_log" ("org_id", "rule_id", "account_id", "created_at");

-- ── RLS for the new tables (same pattern as 0000) ──
alter table "orchestrator_rules" enable row level security;
alter table "action_log"         enable row level security;
alter table "orchestrator_rules" force row level security;
alter table "action_log"         force row level security;

do $$
declare
  t text;
begin
  foreach t in array array['orchestrator_rules', 'action_log']
  loop
    execute format($f$
      create policy "%1$s_tenant_isolation" on "%1$s"
        using (org_id::text = current_setting('app.current_org_id', true))
        with check (org_id::text = current_setting('app.current_org_id', true));
    $f$, t);
  end loop;
end$$;
