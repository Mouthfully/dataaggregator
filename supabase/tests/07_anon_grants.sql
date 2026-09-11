-- What `anon` can reach, asserted per table rather than inferred from a revoke.
--
-- THE ANON KEY IS PUBLIC. It ships in browsers; that is what it is for. So every privilege `anon`
-- holds in `public` is a privilege the internet holds, and the only correct number is zero: the
-- edge reaches the database as `authenticated` or through a `security definer` function, never as
-- `anon` against a table.
--
-- This file exists because the repository had two mechanisms for that and no assertion. Migration
-- 0700 revokes `on all tables in schema public` -- resolved at execution time, so it covered the
-- seven tables that existed then and missed `envelope_rows`, `restatement_events` and
-- `webhook_endpoints`, created in 1100 and 1200. Supabase's default privileges then granted `anon`
-- full DML on those three. Row-level security is why that was not a leak; it is not why it was not
-- a problem.
--
-- A privilege check is not a row-level-security check and does not replace `01_rls_isolation.sql`.
-- It is the layer underneath: RLS decides which rows a role may see, `has_table_privilege` decides
-- whether the role may address the table at all. The repository's stated posture is both, and
-- before this file only one of them was tested.

\o /dev/null

create schema if not exists app_test;
create table if not exists app_test.results (
  id serial primary key, name text not null, passed boolean not null, detail text
);
truncate app_test.results;

create or replace function app_test.check(p_name text, p_passed boolean, p_detail text default null)
returns void language sql as $$
  insert into app_test.results (name, passed, detail) values (p_name, coalesce(p_passed, false), p_detail);
$$;

-- ---------------------------------------------------------------------------------------------
-- Every table in `public`, every privilege, one assertion each.
--
-- Driven off `pg_class` rather than a hand-written list, so a table added by a future migration is
-- covered the day it appears instead of the day somebody remembers to add it here. That is the
-- whole failure this file is about: the thing that broke was a list resolved once.
-- ---------------------------------------------------------------------------------------------
do $$
declare
  r record;
  v_priv text;
begin
  for r in
    select c.oid, c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r'
     order by c.relname
  loop
    foreach v_priv in array array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']
    loop
      perform app_test.check(
        format('anon holds no %s on public.%s', v_priv, r.relname),
        not has_table_privilege('anon', r.oid, v_priv),
        format('anon can %s public.%s -- the anon key is public, so this is the internet', v_priv, r.relname)
      );
    end loop;
  end loop;
end $$;

-- ---------------------------------------------------------------------------------------------
-- The default privilege itself, not only its consequences.
--
-- The assertions above pass the moment someone revokes by hand. This one fails unless the DEFAULT
-- was changed too -- which is the difference between fixing three tables and fixing the class.
-- ---------------------------------------------------------------------------------------------
do $$
declare v_acl text;
begin
  select coalesce(d.defaclacl::text, '')
    into v_acl
    from pg_default_acl d
    join pg_namespace n on n.oid = d.defaclnamespace
   where n.nspname = 'public' and d.defaclobjtype = 'r'
   limit 1;

  perform app_test.check(
    'a table added by a future migration will not grant anything to anon',
    coalesce(v_acl, '') not like '%anon=%',
    format('default privileges for new public tables still name anon: %s', coalesce(v_acl, '(none)'))
  );
end $$;

-- ---------------------------------------------------------------------------------------------
-- The grants that must SURVIVE, so a revoke cannot be "fixed" by revoking everything.
--
-- Without these, the file above is satisfied by a schema nobody can read. `authenticated` holds
-- exactly what 0700, 1100 and 1200 granted, and row-level security narrows it to the caller's own
-- workspace -- which `01_rls_isolation.sql` is what actually proves.
-- ---------------------------------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select unnest(array[
      'organisations','workspaces','members','workspace_members',
      'invitations','connections','api_keys','envelope_rows',
      'restatement_events','webhook_endpoints'
    ]) as t
  loop
    perform app_test.check(
      format('authenticated can still select public.%s', r.t),
      has_table_privilege('authenticated', format('public.%s', r.t)::regclass, 'SELECT'),
      format('the revoke took authenticated''s select on public.%s with it', r.t)
    );
  end loop;
end $$;

-- `anon` keeps exactly one thing, and it is deliberate: EXECUTE on the key-verification function,
-- which takes a SHA-256 hash and is why the edge needs no service-role key. See
-- 20260908000800_api_key_verification.sql, and issue #19 on the second function that shares it.
select app_test.check('anon can still execute verify_api_key, which is the documented exception',
  has_function_privilege('anon', 'public.verify_api_key(bytea)', 'EXECUTE'));

-- ---------------------------------------------------------------------------------------------
-- Summary
--
-- The floor is asserted for the reason given in 06_jwt_claims.sql: a suite that stops running
-- looks exactly like a suite that passes. Ten tables times seven privileges is the bulk of it.
-- ---------------------------------------------------------------------------------------------
\o

select name, 'FAIL' as result, detail from app_test.results where not passed order by id;
select count(*) filter (where passed) as passed,
       count(*) filter (where not passed) as failed,
       count(*) as total
from app_test.results;

do $$
declare v_failed integer; v_total integer;
begin
  select count(*) filter (where not passed), count(*) into v_failed, v_total from app_test.results;
  if v_failed > 0 then raise exception 'anon grants: % assertion(s) failed', v_failed; end if;
  if v_total < 80 then
    raise exception 'anon grants: only % assertion(s) ran; expected at least 80', v_total;
  end if;
end $$;
