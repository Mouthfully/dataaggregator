-- Local-only shim: the parts of a Supabase project the migrations assume exist.
--
-- NOT a migration and never applied to a real project -- Supabase provides all of this. It exists
-- so the migrations and the RLS tests can be executed against a plain PostgreSQL 16 cluster, which
-- is the only way to run them in an environment with no Docker for `supabase start`.

create schema if not exists extensions;
create schema if not exists auth;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end $$;

grant usage on schema public, extensions to anon, authenticated, service_role;

create table if not exists auth.users (
  id    uuid primary key default gen_random_uuid(),
  email text unique
);

-- SUPABASE'S DEFAULT PRIVILEGES ON `public`, WHICH ARE WHY THIS FILE IS NOT OPTIONAL DETAIL.
--
-- A hosted project ships `alter default privileges in schema public grant all on tables to anon,
-- authenticated, service_role`. A stock postgres:16 container ships nothing of the kind, so every
-- table created by a migration is reachable by `anon` on Supabase and by nobody locally.
--
-- Without these three lines the suite cannot see a whole class of defect: a `revoke ... on all
-- tables ... from anon` only affects tables that exist when it runs, so any table created by a
-- LATER migration silently keeps the default grant. That is not hypothetical -- it was live on the
-- first real project for envelope_rows, restatement_events and webhook_endpoints, and CI was green
-- throughout. Model the platform, or test against a fiction.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
