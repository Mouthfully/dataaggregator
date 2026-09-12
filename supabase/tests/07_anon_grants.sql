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

-- ---------------------------------------------------------------------------------------------
-- The anon-executable surface, ENUMERATED rather than asserted in a comment.
--
-- `anon` keeps EXECUTE on exactly two functions, and both are gated on the SHA-256 hash of an API
-- key: producing the argument IS the proof of possession, which is the only reason an `anon` grant
-- on a function that WRITES is defensible. Issue #19 is what that looks like when it is missing --
-- `consume_api_key_credits` took an `api_key_id`, a uuid that appears in logs, error payloads and
-- support tickets, so the whole authorisation for spending a tenant's monthly budget to its cap
-- was knowing an identifier. The anon key is public; it ships in browsers.
--
-- The invariant was WRITTEN DOWN in 20260908000800_api_key_verification.sql -- "the only
-- anon-executable function in the schema" -- and contradicted thirty lines below itself, because
-- nothing checked. So it is checked here, off `pg_proc`, and it fails on the THIRD function rather
-- than on a hand-written list somebody has to remember to update. That matters more than usual:
-- PostgreSQL's built-in default ACL grants EXECUTE on a new function to PUBLIC, `anon` is a member
-- of PUBLIC, and `alter default privileges` cannot revoke it -- so unlike tables, there is no
-- schema-level fix, and every function in `public` is anon-executable until its migration says
-- otherwise. This loop is the enforcement.
--
-- Two exclusions, both deliberate:
--   * Extension-owned functions. pgcrypto lives in `extensions` on a Supabase project, but
--     `run-local.sh` installs it before the migrations run, so locally its thirty `digest`,
--     `hmac` and `pgp_*` overloads sit in `public`. Counting them would report an anon surface
--     that does not exist in production and drown the two that do.
--   * Schema `app`. Its functions carry no ACL, so PUBLIC's built-in EXECUTE makes
--     `has_function_privilege` answer yes for every one of them -- and `anon` cannot call a single
--     one, because it holds no USAGE on the schema. Asserted below rather than assumed, since the
--     exclusion is only honest while that stays true.
-- ---------------------------------------------------------------------------------------------
select app_test.check('anon can still execute verify_api_key, which is the documented exception',
  has_function_privilege('anon', 'public.verify_api_key(bytea)', 'EXECUTE'));

select app_test.check('anon can execute consume_api_key_credits, which now demands the key hash',
  has_function_privilege('anon', 'public.consume_api_key_credits(bytea, integer)', 'EXECUTE'));

-- A dropped function takes its grants with it; an overload does not. If the id-keyed signature is
-- still resolvable, the fix added a second door rather than closing the first.
select app_test.check('the id-keyed consume_api_key_credits is gone, not merely superseded',
  to_regprocedure('public.consume_api_key_credits(uuid, integer)') is null);

select app_test.check('anon holds no USAGE on schema app, which is why only public is enumerated',
  not has_schema_privilege('anon', 'app', 'USAGE'));

do $$
declare
  r record;
  -- STILL TWO. `public.ingest_envelope_rows(jsonb)` was added by
  -- 20260912000300_ingest_entry_point.sql and is deliberately NOT here: it is executable only by
  -- `app_ingest`, never by anon, and the assertions below the loop check that directly. A third
  -- entry in this array would mean the internet could write envelope rows.
  v_expected constant text[] := array[
    'public.consume_api_key_credits(bytea, integer)',
    'public.verify_api_key(bytea)'
  ];
  v_found text[] := '{}';
begin
  for r in
    -- `oidvectortypes`, not `pg_get_function_identity_arguments`: the expected list is a SIGNATURE,
    -- and renaming a parameter must not be able to make a function look like a new one.
    select format('%s.%s(%s)', n.nspname, p.proname, oidvectortypes(p.proargtypes)) as sig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prokind = 'f'
       and has_function_privilege('anon', p.oid, 'EXECUTE')
       and not exists (select 1 from pg_depend d
                        where d.objid = p.oid and d.deptype = 'e')
     order by 1
  loop
    v_found := v_found || r.sig;
    perform app_test.check(
      format('%s is an intended anon-executable function', r.sig),
      r.sig = any (v_expected),
      format('%s is callable by anon, so it is callable by the internet. Two functions are meant '
             'to be, and both are gated on possession of an API key hash.', r.sig)
    );
  end loop;

  -- The loop above cannot notice a DISAPPEARANCE. This does: a revoke that quietly took the edge's
  -- own entry points with it presents as "every API key is rejected" and costs somebody a day.
  perform app_test.check(
    'exactly the two intended functions are anon-executable in public',
    v_found = v_expected,
    format('anon-executable set in public is %s; expected %s', v_found, v_expected)
  );
end $$;

-- ---------------------------------------------------------------------------------------------
-- What the anon-executable WRITE can do WITHOUT the secret. This is the whole of issue #19.
--
-- 01_rls_isolation.sql proves the charge works for a caller holding the key. These prove the other
-- half: a caller who knows only an `api_key_id` -- out of a log, an error payload, a support
-- ticket -- can no longer spend anything, because the argument is the hash and the hash is the
-- credential. Run as `anon` deliberately; that is the role the grant is about.
-- ---------------------------------------------------------------------------------------------
begin;
  set local role anon;

  select app_test.check('a charge against an unknown key hash is refused',
    (select not public.consume_api_key_credits(digest('not-a-real-key', 'sha256'), 1)));
  select app_test.check('a malformed hash cannot be charged',
    (select not public.consume_api_key_credits('\xdeadbeef'::bytea, 1)));
  -- `null::bytea`, not a bare `null`: an untyped null makes the call ambiguous the moment a second
  -- overload exists, and psql stops on the error before the assertions above ever report. A
  -- mutation that restored the id-keyed function was caught by exactly that, which is a worse way
  -- to be told.
  select app_test.check('a null hash cannot be charged',
    (select not public.consume_api_key_credits(null::bytea, 1)));
commit;

-- ---------------------------------------------------------------------------------------------
-- THE INGEST ENTRY POINT, asserted from both directions.
--
-- `public.ingest_envelope_rows` is the one function in `public` that WRITES derived platform data,
-- and the enumeration above only proves anon cannot reach it. These prove the rest of the shape:
-- that the role which is supposed to reach it can, and that the role PostgREST assumes on a tenant
-- request cannot. A revoke that took `app_ingest` with it presents as "ingest silently writes
-- nothing", which is the failure this whole file exists to make loud.
-- ---------------------------------------------------------------------------------------------
select app_test.check('app_ingest may execute the ingest entry point',
  has_function_privilege('app_ingest', 'public.ingest_envelope_rows(jsonb)', 'EXECUTE'));

select app_test.check('anon may NOT execute the ingest entry point',
  not has_function_privilege('anon', 'public.ingest_envelope_rows(jsonb)', 'EXECUTE'),
  'the anon key is public and ships in browsers; this function writes the numbers the product guarantees');

select app_test.check('authenticated may NOT execute the ingest entry point',
  not has_function_privilege('authenticated', 'public.ingest_envelope_rows(jsonb)', 'EXECUTE'),
  'a tenant able to call this could fabricate its own reported numbers');

-- PostgREST logs in as `authenticator` and SET LOCAL ROLEs to the token's claim. Without this
-- membership the SET ROLE fails and surfaces as a rejected token, sending whoever hits it to look
-- at the signing secret rather than at role membership.
--
-- 'MEMBER', NOT 'USAGE', AND THE DIFFERENCE IS THE WHOLE POINT. `pg_has_role(..., 'USAGE')` asks
-- whether the role holds the privileges PASSIVELY, by inheritance; 'MEMBER' asks whether it may
-- SET ROLE to it. `authenticator` is NOINHERIT, so USAGE is false here while the grant is recorded
-- and SET ROLE works -- this assertion was written as USAGE first and failed against a correct
-- migration, which is a cheaper way to learn it than in production.
select app_test.check('authenticator may assume app_ingest, which is how PostgREST reaches it',
  pg_has_role('authenticator', 'app_ingest', 'MEMBER'));

-- AND IT MUST NOT INHERIT. If `authenticator` were INHERIT, it would hold app_ingest's EXECUTE
-- passively on EVERY request -- including a tenant's, before any SET ROLE narrows it -- which turns
-- the careful revoke above into decoration. Supabase ships it NOINHERIT; this asserts that rather
-- than trusting it, because the property is invisible until something exploits it.
select app_test.check('authenticator does not INHERIT app_ingest, so a tenant request never holds it',
  not (select rolinherit from pg_roles where rolname = 'authenticator'),
  'an inheriting authenticator holds app_ingest EXECUTE on every request, before SET ROLE narrows it');

-- ---------------------------------------------------------------------------------------------
-- Summary
--
-- The floor is asserted for the reason given in 06_jwt_claims.sql: a suite that stops running
-- looks exactly like a suite that passes. Ten tables times seven privileges is the bulk of it;
-- the anon-executable loop above contributes one assertion per function it finds, which is why
-- the floor sits a little under the current total rather than on it.
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
  if v_total < 93 then
    raise exception 'anon grants: only % assertion(s) ran; expected at least 93', v_total;
  end if;
end $$;
