-- FORCE ROW LEVEL SECURITY, ASSERTED FOR EVERY TABLE RATHER THAN FOR A LIST.
--
-- `20260908000700_rls.sql` opens by stating the rule and the reason:
--
--   FORCE ROW LEVEL SECURITY on every table, not merely ENABLE: without FORCE, the table owner
--   bypasses its own policies, and migrations run as the owner.
--
-- Three tables landed later without it -- `billing_customers`, `subscriptions` and `waitlist` --
-- and nothing went red, for two separate reasons, both of which this file exists to close:
--
--   1. THE CHECK THAT LOOKED LIKE THIS ONE WAS NOT THIS ONE. `12_billing.sql` asserted
--      `c.relrowsecurity` and never `c.relforcerowsecurity`. It read, at a glance and in its own
--      assertion name, as a check on the rule above. A test that resembles a guard is worse than an
--      absent one, because it is the reason nobody looks twice.
--
--   2. IT WAS A LIST. A test that names the tables it knows about cannot fail for the table it does
--      not -- and "a table added later" is the entire failure mode here. So this file reads the
--      catalogue: EVERY ordinary table in `public`, whatever it is called and whenever it landed.
--
-- ENABLE is asserted the same way, and not because it is currently at risk. A table with neither
-- setting is the worse version of this bug, and a list-shaped test would have missed it exactly as
-- the list-shaped test missed FORCE.
--
-- Then the mechanism itself, on a throwaway table owned by a throwaway role, because the whole
-- schema rests on a sentence about PostgreSQL that is quoted everywhere here and demonstrated
-- nowhere: FORCE binds the owner, and BYPASSRLS beats FORCE. Every SECURITY DEFINER write path in
-- this schema -- `app.upsert_envelope_row`, `app.claim_connection`, `app.create_organisation`,
-- `app.record_ambient_reading`, `public.join_waitlist` -- writes a FORCED table through no policy
-- that admits its owner, so if that sentence is wrong they all fail together.
--
-- WHAT THIS SUITE CANNOT DO, stated here rather than discovered later: `run-local.sh` connects as a
-- SUPERUSER, who bypasses row security whether or not FORCE is set. So FORCE never binds in this
-- database, and no assertion below proves that it binds in the hosted one. Section 2 proves the
-- MECHANISM under a role that does not bypass; section 1 proves the SETTING is present. Between
-- them they cover what a local suite can cover, and the rest is a property of the deployment.

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
-- 1. EVERY ORDINARY TABLE IN `public`, READ OFF THE CATALOGUE.
--
--    Partitioned tables ('p') are included because a policy applies to the partitioned parent;
--    views, sequences and foreign tables are not tables and hold no policies. There are none of
--    either today, and the relkind filter says which it would do if there were.
-- ---------------------------------------------------------------------------------------------
do $$
declare r record; v_tables integer := 0;
begin
  for r in
    select c.relname, c.relrowsecurity, c.relforcerowsecurity
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind in ('r', 'p')
     order by c.relname
  loop
    v_tables := v_tables + 1;

    perform app_test.check(
      format('public.%s has row-level security ENABLED', r.relname),
      r.relrowsecurity,
      'alter table ... enable row level security'
    );

    -- THE ONE THIS FILE WAS WRITTEN FOR. Without FORCE the owner bypasses its own policies, and
    -- migrations, definer functions and anything the dashboard runs are the owner.
    perform app_test.check(
      format('public.%s has row-level security FORCED, not merely enabled', r.relname),
      r.relforcerowsecurity,
      'alter table ... force row level security'
    );
  end loop;

  -- A LOOP OVER AN EMPTY SET PASSES EVERY ASSERTION IT DOES NOT MAKE. If a future schema change
  -- moves these tables, renames the schema, or breaks this query, the failure must look like a
  -- failure and not like a clean run. Fifteen tables today.
  perform app_test.check(
    format('the catalogue query found the tables it is checking (%s found)', v_tables),
    v_tables >= 15,
    'if this fails, every assertion above is vacuous'
  );
end $$;

-- ---------------------------------------------------------------------------------------------
-- 2. THE MECHANISM, ON A ROLE THAT DOES NOT BYPASS.
--
--    Three states of one table, owned by a role with neither SUPERUSER nor BYPASSRLS, written
--    through a SECURITY DEFINER function it owns -- the exact arrangement every write path in this
--    schema uses:
--
--      a. ENABLE only          -> the owner bypasses its own absent policies. The write lands.
--      b. ENABLE + FORCE       -> the owner is bound by them. The write is denied.
--      c. + BYPASSRLS on owner -> the attribute beats FORCE. The write lands again.
--
--    (a) is what the three tables in `20260913000200` were in until that migration. (c) is the
--    property `public.join_waitlist` and every `app.` writer depend on, so it is demonstrated here
--    rather than assumed from the manual.
-- ---------------------------------------------------------------------------------------------
drop table if exists app_test.force_demo;
drop role if exists app_test_owner;
create role app_test_owner nologin noinherit nobypassrls;
grant usage on schema app_test to app_test_owner;

create table app_test.force_demo (id serial primary key, note text);
alter table app_test.force_demo owner to app_test_owner;

-- SECURITY DEFINER, so the body runs as app_test_owner: a role that is neither superuser nor
-- BYPASSRLS, which is exactly what the local superuser connection cannot otherwise simulate.
create or replace function app_test.force_demo_write(p_note text)
returns void language plpgsql volatile security definer set search_path = app_test, pg_temp as $$
begin
  insert into app_test.force_demo (note) values (p_note);
end;
$$;
alter function app_test.force_demo_write(text) owner to app_test_owner;

-- a. ENABLE without FORCE: the owner writes past its own absent policies.
alter table app_test.force_demo enable row level security;
do $$
declare v_landed boolean := true;
begin
  begin
    perform app_test.force_demo_write('enable-only');
  exception when insufficient_privilege then v_landed := false;
  end;
  perform app_test.check(
    'ENABLE alone does not bind the owner -- the definer write lands, which is the bug',
    v_landed and exists (select 1 from app_test.force_demo where note = 'enable-only'),
    'this is the state billing_customers, subscriptions and waitlist were in'
  );
end $$;

-- b. FORCE: the owner is bound by the policies it has, and it has none.
alter table app_test.force_demo force row level security;
do $$
declare v_landed boolean := true; v_state text := '';
begin
  begin
    perform app_test.force_demo_write('forced');
  exception when insufficient_privilege then v_landed := false; v_state := sqlstate;
  end;
  perform app_test.check(
    'FORCE binds the owner -- the same definer write is denied, with no policy to admit it',
    (not v_landed) and not exists (select 1 from app_test.force_demo where note = 'forced'),
    case when v_landed then 'POLICY BYPASS: the row landed' else format('denied: %s', v_state) end
  );
end $$;

-- c. BYPASSRLS on the owner: the attribute beats FORCE. This is what every definer write path in
--    this schema is standing on, and the reason `20260913000200` adds no policies.
--
--    `discard plans` IS NOT TIDINESS AND MUST NOT BE DELETED. Without it this assertion fails, and
--    the first draft of this file did fail here -- which read, for a few minutes, like a discovery
--    that BYPASSRLS does not beat FORCE and that the entire schema's write path was broken. It is
--    not: `alter role ... bypassrls` does NOT invalidate plans already cached in a live session, so
--    `force_demo_write` kept reusing the plan it built in (b), when the owner was still bound. A
--    fresh session gets it right; this one has to be told.
--
--    That is a real operational hazard and not a quirk of this test. An operator granting BYPASSRLS
--    to clear an outage will see nothing change on connections that have already run the statement
--    -- the pooler's, in particular, which outlive any single request. The fix is a new connection,
--    not a second grant.
alter role app_test_owner bypassrls;
discard plans;
do $$
declare v_landed boolean := true;
begin
  begin
    perform app_test.force_demo_write('bypassrls');
  exception when insufficient_privilege then v_landed := false;
  end;
  perform app_test.check(
    'BYPASSRLS on the owner beats FORCE -- which is what every SECURITY DEFINER writer here needs',
    v_landed and exists (select 1 from app_test.force_demo where note = 'bypassrls'),
    'if this ever fails, join_waitlist and every app.* writer fail with it'
  );
end $$;

drop function app_test.force_demo_write(text);
drop table app_test.force_demo;
revoke usage on schema app_test from app_test_owner;
drop role app_test_owner;

-- ---------------------------------------------------------------------------------------------
-- 3. THE FIX DID NOT WIDEN ANYTHING.
--
--    The first draft of `20260913000200` added permissive policies to keep the definer paths open,
--    which would have opened them to `authenticated` too -- `14_ambient.sql` caught it. These
--    assertions are the standing version of that catch: the three newly-forced tables still have
--    NO write policy, and `waitlist` still has no policy at all.
-- ---------------------------------------------------------------------------------------------
do $$
declare v_tbl text; v_cmd text; v_count integer;
begin
  foreach v_tbl in array array['billing_customers', 'subscriptions', 'waitlist'] loop
    foreach v_cmd in array array['INSERT', 'UPDATE', 'DELETE'] loop
      select count(*) into v_count
        from pg_policy p
        join pg_class c on c.oid = p.polrelid
        join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relname = v_tbl
         and p.polcmd in (case v_cmd when 'INSERT' then 'a' when 'UPDATE' then 'w' else 'd' end, '*');

      perform app_test.check(
        format('forcing public.%s added no %s policy -- the grant layer is still the only door', v_tbl, v_cmd),
        v_count = 0,
        format('%s policies found', v_count)
      );
    end loop;
  end loop;

  select count(*) into v_count
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'waitlist';
  perform app_test.check(
    'public.waitlist still has NO policy of any kind -- 20260912000700 chose a function, not a policy',
    v_count = 0,
    format('%s policies found', v_count)
  );
end $$;

-- And the door itself still opens. WEAK ON PURPOSE, and labelled so: this connection is a
-- superuser, so it proves the function was not broken by the migration and does NOT prove that it
-- survives FORCE on the hosted project. Section 2 is where that mechanism is tested.
do $$
declare v_before bigint; v_after bigint;
begin
  select count(*) into v_before from public.waitlist;
  perform public.join_waitlist('force-rls-suite@example.test', '15_force_rls');
  select count(*) into v_after from public.waitlist;
  perform app_test.check(
    'public.join_waitlist still writes after the table was forced (superuser connection)',
    v_after = v_before + 1,
    format('%s -> %s rows', v_before, v_after)
  );
  delete from public.waitlist where email = 'force-rls-suite@example.test';
end $$;

\o

select name, 'FAIL' as result, detail from app_test.results where not passed order by id;
select count(*) filter (where passed) as passed,
       count(*) filter (where not passed) as failed,
       count(*) as total
  from app_test.results;

-- The floor exists for the reason 06_jwt_claims.sql gives: a suite that stops running looks exactly
-- like a suite that passes. Forty-five assertions today -- two per table over fifteen tables, the
-- catalogue-not-empty check, the three mechanism states, nine policy absences over three tables,
-- the waitlist's total absence of policies, and the door still opening.
do $$
declare v_failed integer; v_total integer;
begin
  select count(*) filter (where not passed), count(*) into v_failed, v_total from app_test.results;
  if v_failed > 0 then raise exception 'force rls: % assertion(s) failed', v_failed; end if;
  if v_total < 45 then
    raise exception 'force rls: only % assertion(s) ran; expected at least 45', v_total;
  end if;
end $$;
