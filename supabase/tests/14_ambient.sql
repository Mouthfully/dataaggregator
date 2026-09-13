-- AMBIENT CONTEXT: the shared table and the tenant-scoped subscription beside it.
--
-- `20260912000900_ambient_readings.sql` makes an unusual claim in prose -- that a table with no
-- `workspace_id` and a `using (true)` select policy is correct rather than a hole -- and a claim
-- like that is worth exactly as much as the assertions under it. Prose was also true of the first
-- draft of `billing_customers`, which put `stripe_customer_id` on a table any admin could update.
--
-- So this file checks the two halves separately, because they have opposite obligations:
--
--   ambient_subscriptions   ISOLATES. One workspace's row is invisible and unwritable to another
--                           organisation, in all four commands. This is the ordinary tenant rule
--                           and nothing about ambient data relaxes it.
--
--   ambient_readings        DOES NOT isolate, ON PURPOSE, and that is asserted as a POSITIVE
--                           property: a workspace holding NO subscription at all still reads
--                           every row. A migration that later "fixed" the missing tenant
--                           predicate would fail here rather than silently changing what the
--                           product serves.
--
--   ...and the PRECONDITION the exemption rests on is checked off the catalogue: no column of
--   `ambient_readings` references a workspace, a member, a connection or an external account. The
--   day one does, the exemption is void, and this suite says so before a reviewer has to notice.
--
-- Plus the decision NOT to invent a credential lane, asserted as two absences -- because an
-- absence justified in a comment is the one thing nothing ever rechecks.

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

-- RLS denies in two shapes and conflating them hides a real bypass: an INSERT violating WITH CHECK
-- raises 42501, while UPDATE and DELETE are FILTERED by USING and quietly affect zero rows. Both
-- count as denial; anything that actually moved a row does not. (Same reasoning as the helper in
-- 01_rls_isolation.sql, restated locally so this file stands on its own.)
create or replace function app_test.ambient_denied(p_name text, p_sql text)
returns void language plpgsql as $$
declare v_rows bigint;
begin
  execute p_sql;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    perform app_test.check(p_name, true, 'denied by row filter: 0 rows affected');
  else
    perform app_test.check(p_name, false, format('POLICY BYPASS: %s row(s) affected', v_rows));
  end if;
exception
  when insufficient_privilege then
    perform app_test.check(p_name, true, 'denied by WITH CHECK: 42501');
  when others then
    perform app_test.check(p_name, false, format('unexpected error: %s', sqlerrm));
end;
$$;

grant usage on schema app_test to authenticated, anon;
grant all on app_test.results to authenticated, anon;
grant usage, select on all sequences in schema app_test to authenticated, anon;
grant execute on all functions in schema app_test to authenticated, anon;

-- ---------------------------------------------------------------------------------------------
-- Fixture. Its own organisations rather than 01's, so this file does not depend on the order the
-- runner happens to use.
--
--   Org A "Ambient A"   workspace wa   alice owner   -> subscribes to Air4Thai station 03t
--   Org B "Ambient B"   workspace wb   carol owner   -> subscribes to NOTHING
--
-- Carol's empty subscription list is not padding: she is the probe for the readings decision.
-- ---------------------------------------------------------------------------------------------

insert into auth.users (id, email) values
  ('a1111111-1111-1111-1111-111111111111', 'alice@ambient-a.test'),
  ('a3333333-3333-3333-3333-333333333333', 'carol@ambient-b.test')
on conflict do nothing;

insert into public.organisations (id, name, slug) values
  ('aa000000-0000-0000-0000-0000000000aa', 'Ambient A', 'ambient-a'),
  ('bb000000-0000-0000-0000-0000000000bb', 'Ambient B', 'ambient-b');

insert into public.workspaces (id, organisation_id, name, slug) values
  ('ca000000-0000-0000-0000-0000000000ca', 'aa000000-0000-0000-0000-0000000000aa', 'A Workspace', 'ambient-a-ws'),
  ('cb000000-0000-0000-0000-0000000000cb', 'bb000000-0000-0000-0000-0000000000bb', 'B Workspace', 'ambient-b-ws');

insert into public.members (id, organisation_id, user_id, role) values
  ('da000000-0000-0000-0000-0000000000da', 'aa000000-0000-0000-0000-0000000000aa', 'a1111111-1111-1111-1111-111111111111', 'owner'),
  ('db000000-0000-0000-0000-0000000000db', 'bb000000-0000-0000-0000-0000000000bb', 'a3333333-3333-3333-3333-333333333333', 'owner');

insert into public.ambient_subscriptions (id, workspace_id, source, station_id, label) values
  ('5b000000-0000-0000-0000-00000000005b', 'ca000000-0000-0000-0000-0000000000ca', 'air4thai', '03t', 'the warehouse');

-- Public readings. Two stations, two parameters, two hours -- enough that a key collapsing to
-- fewer columns is visible as a missing row rather than as a smaller number nobody questions.
insert into public.ambient_readings (source, station_id, observed_at, parameter, value, unit, fetched_at) values
  ('air4thai', '03t', '2026-09-12T07:00:00Z', 'pm25', 12.3, 'ug/m3', '2026-09-12T07:12:00Z'),
  ('air4thai', '03t', '2026-09-12T07:00:00Z', 'pm10', 22.0, 'ug/m3', '2026-09-12T07:12:00Z'),
  ('air4thai', '03t', '2026-09-12T08:00:00Z', 'pm25', 15.1, 'ug/m3', '2026-09-12T08:12:00Z'),
  ('air4thai', '44t', '2026-09-12T07:00:00Z', 'pm25',  9.8, 'ug/m3', '2026-09-12T07:12:00Z');

-- ---------------------------------------------------------------------------------------------
-- 1. THE SUBSCRIPTION TABLE ISOLATES. The ordinary tenant rule, in all four commands.
-- ---------------------------------------------------------------------------------------------

begin;
  set local role authenticated;
  select set_config('request.jwt.claim.sub', 'a1111111-1111-1111-1111-111111111111', true);

  select app_test.check('the owner sees her own workspace''s subscription',
    (select count(*) = 1 from public.ambient_subscriptions));
  select app_test.check('and it is the one she created',
    (select station_id = '03t' from public.ambient_subscriptions));
commit;

begin;
  set local role authenticated;
  select set_config('request.jwt.claim.sub', 'a3333333-3333-3333-3333-333333333333', true);

  -- The headline. Carol is an owner in a different organisation with a perfectly valid session.
  select app_test.check('another organisation''s owner sees NO subscription of theirs',
    (select count(*) = 0 from public.ambient_subscriptions));

  select app_test.ambient_denied(
    'she cannot insert a subscription into a workspace she does not hold',
    $q$insert into public.ambient_subscriptions (workspace_id, source, station_id)
       values ('ca000000-0000-0000-0000-0000000000ca', 'air4thai', '99t')$q$);

  select app_test.ambient_denied(
    'she cannot relabel their subscription',
    $q$update public.ambient_subscriptions set label = 'mine now'
        where id = '5b000000-0000-0000-0000-00000000005b'$q$);

  select app_test.ambient_denied(
    'she cannot delete their subscription',
    $q$delete from public.ambient_subscriptions
        where id = '5b000000-0000-0000-0000-00000000005b'$q$);
commit;

-- THE RE-POINT: alice may edit her own row, so the question is whether she can move it into
-- another organisation's tenancy through a row she legitimately owns.
--
-- THIS DOES NOT ISOLATE THE `with check` CLAUSE, and saying so is the correction a mutation test
-- forced. Deleting `with check` from the policy leaves this green, because PostgreSQL falls back
-- to the USING expression when no WITH CHECK is given. What it does assert is the composite: that
-- whatever the policy is written as, the destination workspace is tested and not merely the
-- source. A policy rewritten as `using (true) with check (...)` or one whose USING is later
-- widened fails here.
begin;
  set local role authenticated;
  select set_config('request.jwt.claim.sub', 'a1111111-1111-1111-1111-111111111111', true);

  select app_test.ambient_denied(
    'an owner cannot re-point her own subscription at another organisation''s workspace',
    $q$update public.ambient_subscriptions
          set workspace_id = 'cb000000-0000-0000-0000-0000000000cb'
        where id = '5b000000-0000-0000-0000-00000000005b'$q$);
commit;

select app_test.check('the re-point really did not happen',
  (select workspace_id = 'ca000000-0000-0000-0000-0000000000ca'
     from public.ambient_subscriptions where id = '5b000000-0000-0000-0000-00000000005b'));

-- ---------------------------------------------------------------------------------------------
-- 2. THE READINGS TABLE DOES NOT ISOLATE, AND THAT IS THE DOCUMENTED BEHAVIOUR.
--
-- Asserted positively, on the workspace holding NO subscription, because that is the exact case a
-- subscription-gated policy would break. If somebody later "repairs" the missing tenant predicate,
-- this is what tells them it was not missing.
-- ---------------------------------------------------------------------------------------------

begin;
  set local role authenticated;
  select set_config('request.jwt.claim.sub', 'a3333333-3333-3333-3333-333333333333', true);

  select app_test.check(
    'a workspace with NO ambient subscription still reads every public reading -- the migration '
    'documents this as deliberate: the same numbers are served unauthenticated by the agency',
    (select count(*) = 4 from public.ambient_readings));

  select app_test.check('including a station nobody subscribed to',
    (select count(*) = 1 from public.ambient_readings where station_id = '44t'));
commit;

begin;
  set local role authenticated;
  select set_config('request.jwt.claim.sub', 'a1111111-1111-1111-1111-111111111111', true);

  select app_test.check('the subscribing workspace reads exactly the same rows, not more',
    (select count(*) = 4 from public.ambient_readings));

  -- READABLE IS NOT WRITABLE. There is no insert, update or delete policy and no write grant, so
  -- FORCE RLS denies all three: a tenant able to write these rows could fabricate the context a
  -- diagnosis is later explained with.
  select app_test.ambient_denied('a tenant cannot insert a reading',
    $q$insert into public.ambient_readings (source, station_id, observed_at, parameter, value, unit, fetched_at)
       values ('air4thai', '03t', '2026-09-12T09:00:00Z', 'pm25', 0.1, 'ug/m3', now())$q$);

  select app_test.ambient_denied('a tenant cannot edit a reading',
    $q$update public.ambient_readings set value = 999 where station_id = '03t'$q$);

  select app_test.ambient_denied('a tenant cannot delete a reading',
    $q$delete from public.ambient_readings where station_id = '03t'$q$);
commit;

select app_test.check('and none of those writes landed',
  (select count(*) = 4 from public.ambient_readings)
  and (select max(value) < 999 from public.ambient_readings));

-- ---------------------------------------------------------------------------------------------
-- 3. THE PRECONDITION THE EXEMPTION RESTS ON.
--
-- The migration's argument is not "ambient data is special", it is "no column of this table can
-- identify a tenant". That is a checkable property of the catalogue, so it is checked -- both as
-- a foreign key and as a column name, because a `workspace_id uuid` with no REFERENCES would pass
-- the first test and still be tenant data.
-- ---------------------------------------------------------------------------------------------

do $$
declare v_fks integer; v_cols text;
begin
  select count(*) into v_fks
    from pg_constraint
   where conrelid = 'public.ambient_readings'::regclass and contype = 'f';

  perform app_test.check(
    'public.ambient_readings holds NO foreign key to any tenant table -- the reason it needs no '
    'tenant predicate',
    v_fks = 0,
    format('%s foreign key(s) found', v_fks));

  select string_agg(attname, ', ') into v_cols
    from pg_attribute
   where attrelid = 'public.ambient_readings'::regclass
     and attnum > 0 and not attisdropped
     and (attname ~ 'workspace|organisation|organization|member|connection|account');

  perform app_test.check(
    'and no column named for a tenant either -- a workspace_id without a REFERENCES is still '
    'tenant data, and would void the shared-table exemption',
    v_cols is null,
    format('tenant-shaped column(s): %s', v_cols));
end $$;

-- ---------------------------------------------------------------------------------------------
-- 4. IDEMPOTENCY. A re-fetch of the same hour must be a no-op that refreshes, never a duplicate.
--
-- Run as the owner, which is the ingest path's privilege level. Three properties, and the third is
-- the one a careless `on conflict do update` destroys.
-- ---------------------------------------------------------------------------------------------

do $$
declare
  v_first_seen timestamptz;
  v_after      timestamptz;
  v_value      numeric;
  v_fetched    timestamptz;
  v_rows       integer;
begin
  select first_seen_at into v_first_seen
    from public.ambient_readings
   where source = 'air4thai' and station_id = '03t'
     and observed_at = '2026-09-12T07:00:00Z' and parameter = 'pm25';

  -- The same hour, fetched again an hour later, with the agency's revised value.
  perform app.upsert_ambient_reading(
    'air4thai', '03t', '2026-09-12T07:00:00Z', 'pm25', 13.7, 'ug/m3', '2026-09-12T08:12:00Z');

  select count(*) into v_rows
    from public.ambient_readings
   where source = 'air4thai' and station_id = '03t'
     and observed_at = '2026-09-12T07:00:00Z' and parameter = 'pm25';

  perform app_test.check(
    're-fetching the same hour leaves ONE row, not two -- (source, station, observed_at, '
    'parameter) is what makes a re-pull idempotent',
    v_rows = 1, format('%s row(s)', v_rows));

  select value, fetched_at, first_seen_at into v_value, v_fetched, v_after
    from public.ambient_readings
   where source = 'air4thai' and station_id = '03t'
     and observed_at = '2026-09-12T07:00:00Z' and parameter = 'pm25';

  perform app_test.check('the re-fetch carries the revised value through', v_value = 13.7,
    format('value is %s', v_value));
  perform app_test.check('and moves fetched_at, which is OUR clock',
    v_fetched = '2026-09-12T08:12:00Z', format('fetched_at is %s', v_fetched));

  -- THE ONE A CARELESS UPSERT BREAKS. `first_seen_at` is the immutable anchor: moved by a
  -- re-fetch, there is no longer any way to tell a value the agency revised from one we only
  -- started collecting this morning.
  perform app_test.check(
    'first_seen_at is NOT moved by a re-fetch -- it is the anchor that distinguishes a revision '
    'from a new collection',
    v_after = v_first_seen, format('%s -> %s', v_first_seen, v_after));
end $$;

-- The key includes `parameter` and `observed_at`, and dropping either from it would still pass
-- every test above. These two are the mutation guards for that.
do $$
declare v_rows integer;
begin
  select count(*) into v_rows from public.ambient_readings
   where source = 'air4thai' and station_id = '03t' and observed_at = '2026-09-12T07:00:00Z';
  perform app_test.check(
    'two parameters at the same station and instant are two rows -- `parameter` is part of the key',
    v_rows = 2, format('%s row(s)', v_rows));

  select count(*) into v_rows from public.ambient_readings
   where source = 'air4thai' and station_id = '03t' and parameter = 'pm25';
  perform app_test.check(
    'two hours at the same station and parameter are two rows -- `observed_at` is part of the key',
    v_rows = 2, format('%s row(s)', v_rows));
end $$;

-- `observed_at` is an INSTANT. The migration insists on it because Air4Thai publishes Thai local
-- time with no offset, and a naive column is seven hours of silent error in the plausible
-- direction.
do $$
declare v_type text;
begin
  select format_type(atttypid, atttypmod) into v_type
    from pg_attribute
   where attrelid = 'public.ambient_readings'::regclass and attname = 'observed_at';
  perform app_test.check(
    'observed_at is timestamptz, not a naive local clock reading',
    v_type = 'timestamp with time zone', format('it is %s', v_type));
end $$;

-- ---------------------------------------------------------------------------------------------
-- 5. NO CREDENTIAL WAS INVENTED, asserted as two absences.
--
-- The migration argues at length that a public unauthenticated source is not a connection and
-- needs no lane. An argument in a comment is the one thing nothing rechecks, and the cost of
-- being wrong is concrete: a `none` lane makes `isSelfIssued` answer TRUE and `connectionHealth`
-- report "Connected. This key does not expire" about a credential that does not exist.
-- ---------------------------------------------------------------------------------------------

select app_test.check(
  'app.connection_provider does NOT carry air4thai -- an ambient source is a subscription, not a '
  'connection, and public.connections requires a sealed credential there is none of',
  not exists (
    select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
     where t.typname = 'connection_provider' and e.enumlabel = 'air4thai'));

select app_test.check(
  'app.credential_lane gained no "none" member -- a lane describes how a credential was obtained, '
  'and there is no credential',
  not exists (
    select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
     where t.typname = 'credential_lane' and e.enumlabel = 'none'));

-- ---------------------------------------------------------------------------------------------
-- 6. GRANTS. The layer underneath row-level security: RLS says which rows, this says whether the
--    role may address the table at all. The anon key is public; it ships in browsers.
-- ---------------------------------------------------------------------------------------------

do $$
declare v_tbl text; v_priv text;
begin
  foreach v_tbl in array array['ambient_readings', 'ambient_subscriptions'] loop
    foreach v_priv in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE'] loop
      perform app_test.check(
        format('anon holds no %s on public.%s', v_priv, v_tbl),
        not has_table_privilege('anon', format('public.%s', v_tbl), v_priv));
    end loop;
  end loop;
end $$;

select app_test.check('authenticated may read the shared readings',
  has_table_privilege('authenticated', 'public.ambient_readings', 'SELECT'));
select app_test.check('authenticated holds no INSERT on the shared readings',
  not has_table_privilege('authenticated', 'public.ambient_readings', 'INSERT'));
select app_test.check('authenticated may manage its own subscriptions',
  has_table_privilege('authenticated', 'public.ambient_subscriptions', 'INSERT')
  and has_table_privilege('authenticated', 'public.ambient_subscriptions', 'DELETE'));

-- The write path is the function, not the role.
select app_test.check('app_ingest may execute the ambient upsert',
  has_function_privilege('app_ingest',
    'app.upsert_ambient_reading(app.ambient_source, text, timestamptz, app.ambient_parameter, numeric, text, timestamptz)',
    'EXECUTE'));

-- `anon` and `authenticated` hold no USAGE on schema `app`, so has_function_privilege answers yes
-- for them via PUBLIC's built-in grant and means nothing. The revoke is asserted off the ACL
-- instead, which is where the fix actually lives.
do $$
declare v_acl text;
begin
  select coalesce(proacl::text, '') into v_acl
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'app' and p.proname = 'upsert_ambient_reading';

  perform app_test.check(
    'the ambient upsert''s ACL names neither PUBLIC, anon nor authenticated -- PostgreSQL grants '
    'EXECUTE on a new function to PUBLIC and alter default privileges cannot revoke it',
    -- A PUBLIC entry in an ACL has an EMPTY grantee, so it is spelled `=X/owner` -- either as the
    -- first item (`{=X/`) or after a comma (`,=X/`). Matching a bare `%=X/%` instead would match
    -- `postgres=X/postgres` and pass on every ACL ever written, which is what the first draft of
    -- this assertion did.
    v_acl <> '' and v_acl not like '{=%' and v_acl not like '%,=%'
      and v_acl not like '%anon=%' and v_acl not like '%authenticated=%',
    format('acl is %s', coalesce(nullif(v_acl, ''), '(default: PUBLIC holds EXECUTE)')));
end $$;

-- ---------------------------------------------------------------------------------------------
-- Cleanup. The readings are shared and outlive the tenants, so they are removed explicitly;
-- deleting the organisations cascades the workspaces and their subscriptions.
-- ---------------------------------------------------------------------------------------------

delete from public.ambient_readings where source = 'air4thai';
delete from public.organisations
 where id in ('aa000000-0000-0000-0000-0000000000aa', 'bb000000-0000-0000-0000-0000000000bb');

\o

select name, 'FAIL' as result, detail from app_test.results where not passed order by id;
select count(*) filter (where passed) as passed,
       count(*) filter (where not passed) as failed,
       count(*) as total
  from app_test.results;

-- The floor exists for the reason 06_jwt_claims.sql gives: a suite that stops running looks
-- exactly like a suite that passes. Forty-one assertions today.
do $$
declare v_failed integer; v_total integer;
begin
  select count(*) filter (where not passed), count(*) into v_failed, v_total from app_test.results;
  if v_failed > 0 then raise exception 'ambient: % assertion(s) failed', v_failed; end if;
  if v_total < 41 then
    raise exception 'ambient: only % assertion(s) ran; expected at least 41', v_total;
  end if;
end $$;
