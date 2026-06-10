-- Smoke test for tenant isolation. Run as superuser; this script creates a
-- non-superuser role (the role the API will impersonate at runtime) and
-- verifies that the policies actually scope reads to current_setting('app.current_org_id').

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'abm_app') then
    create role abm_app login password 'abm_app';
  end if;
end $$;

grant usage on schema public to abm_app;
grant select, insert, update, delete on all tables in schema public to abm_app;
alter default privileges in schema public grant select, insert, update, delete on tables to abm_app;

select rolname, rolsuper, rolbypassrls from pg_roles where rolname in ('abm','abm_app') order by rolname;

-- impersonate abm_app for the rest of the session
set role abm_app;

-- without an org bound: should see ZERO rows
begin;
  select 'no_org_set' as scenario, count(*) as visible from accounts;
commit;

-- bind Org A → should see only Org A's row
begin;
  set local app.current_org_id = '11111111-1111-1111-1111-111111111111';
  select 'as_org_a' as scenario, count(*) as visible, string_agg(domain, ',') as domains from accounts;
commit;

-- bind Org B → should see only Org B's row
begin;
  set local app.current_org_id = '22222222-2222-2222-2222-222222222222';
  select 'as_org_b' as scenario, count(*) as visible, string_agg(domain, ',') as domains from accounts;
commit;

reset role;
