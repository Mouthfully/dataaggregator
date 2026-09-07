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
