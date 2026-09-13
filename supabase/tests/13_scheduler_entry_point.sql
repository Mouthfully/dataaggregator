-- The scheduler entry point: can the right role reach it, can everyone else be refused, and does
-- the lease still hold on the near side of the wrapper?
--
-- 02_scheduler.sql tests `app.due_connections`, `app.claim_connection` and `app.record_backfill`.
-- It has always passed, and the functions have always been unreachable -- nothing could assume
-- `app_scheduler`, and schema `app` is not exposed to PostgREST. This file tests the three
-- `public.` wrappers that 20260912000800 added, which is a different question: 02 proves the
-- scheduler's LOGIC, this proves there is a door, that the door is locked to everyone else, and
-- that the wrapper did not quietly widen what comes back through it.
--
-- The four properties that must hold, in the order they are asserted:
--   * the wrappers take NO CLOCK from the caller. A caller-supplied `p_now` in the future makes
--     every live lease look abandoned, which is the lease bypass the migration's longest comment is
--     about. Asserted on the SIGNATURE, because the moment a timestamptz reappears the property is
--     gone whatever the body does.
--   * `due_connections` returns SCHEDULING METADATA ONLY. Asserted as an EXACT column set off
--     pg_proc rather than as "none of these three names appear": a set assertion fails on a column
--     nobody thought to ban, and `external_account_id` is the one a well-meaning widening adds
--     first because it looks like metadata and is the thing you authenticate as.
--   * anon and authenticated are REFUSED, by execution and not by ACL inspection. 07_anon_grants
--     already checks `has_function_privilege`; a privilege check is not a proof that the privilege
--     is enforced, which is the distinction 10_ingest_entry_point.sql draws for the same reason.
--   * a claimed connection cannot be claimed again inside the lease -- through the wrapper, whose
--     whole point is that it supplies the clock both times.

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

/**
 * Run `p_sql` as `p_role` and assert it is REFUSED for want of privilege.
 *
 * `insufficient_privilege` specifically, and not "any error": a wrapper that raised on its own
 * argument checks before the ACL was consulted would satisfy a looser helper while being executable
 * by the internet. The caller must be inside an explicit transaction -- `set local` outside one is
 * a warning and a no-op, which would leave every probe running as the superuser and passing.
 */
create or replace function app_test.check_refused(p_name text, p_sql text, p_role text)
returns void language plpgsql as $$
begin
  execute format('set local role %I', p_role);
  execute p_sql;
  reset role;
  perform app_test.check(p_name, false,
    format('the call SUCCEEDED as %s: %s', p_role, p_sql));
exception
  when insufficient_privilege then
    reset role;
    perform app_test.check(p_name, true, 'denied: ' || sqlerrm);
  when others then
    reset role;
    perform app_test.check(p_name, false,
      format('refused, but not for want of privilege: %s', sqlerrm));
end;
$$;

/** Run `p_sql` as `p_role` and assert it is refused by an ARGUMENT check rather than by the ACL. */
create or replace function app_test.check_rejected(p_name text, p_sql text, p_role text)
returns void language plpgsql as $$
begin
  execute format('set local role %I', p_role);
  execute p_sql;
  reset role;
  perform app_test.check(p_name, false, format('the call SUCCEEDED: %s', p_sql));
exception
  when insufficient_privilege then
    reset role;
    perform app_test.check(p_name, false,
      'refused for want of privilege, so the argument check was never reached');
  when others then
    reset role;
    perform app_test.check(p_name, true, 'rejected: ' || sqlerrm);
end;
$$;

grant usage on schema app_test to authenticated, anon, app_scheduler;
grant all on app_test.results to authenticated, anon, app_scheduler;
grant usage, select on all sequences in schema app_test to authenticated, anon, app_scheduler;
grant execute on all functions in schema app_test to authenticated, anon, app_scheduler;

-- ---------------------------------------------------------------------------------------------
-- Fixture. Its own organisation, so an assertion that counts rows means "exactly mine" rather than
-- "some rows" -- `due_connections` is the one query in this schema that spans tenants, so every
-- earlier suite's leftovers are legitimately in its answer.
--
-- `last_backfill_at` is null on both, which makes them due against `now()`. This file cannot drive
-- a fixed timeline the way 02 does, because taking the clock away from the caller is the property
-- under test.
-- ---------------------------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('a7000000-0000-4000-8000-000000000001', 'scheduler-entry@test.test')
on conflict do nothing;

insert into public.organisations (id, name, slug) values
  ('a7100000-0000-4000-8000-000000000001', 'Scheduler Entry Org', 'scheduler-entry-org');

insert into public.workspaces (id, organisation_id, name, slug) values
  ('a7200000-0000-4000-8000-000000000001', 'a7100000-0000-4000-8000-000000000001',
   'Scheduler Entry Workspace', 'scheduler-entry-workspace');

insert into public.members (id, organisation_id, user_id, role) values
  ('a7300000-0000-4000-8000-000000000001', 'a7100000-0000-4000-8000-000000000001',
   'a7000000-0000-4000-8000-000000000001', 'owner');

insert into public.connections
  (id, workspace_id, provider, external_account_id, credential_ciphertext, credential_iv,
   wrapped_dek, credential_lane, status, expires_at, last_backfill_at)
values
  ('a7400000-0000-4000-8000-000000000001', 'a7200000-0000-4000-8000-000000000001',
   'google_ads', 'entry-111', '\x01', '\x02', '\x03', 'oauth', 'active', null, null),
  ('a7400000-0000-4000-8000-000000000002', 'a7200000-0000-4000-8000-000000000001',
   'ga4', 'entry-222', '\x01', '\x02', '\x03', 'oauth', 'active', null, null);

-- ---------------------------------------------------------------------------------------------
-- THE CLOCK IS NOT A PARAMETER.
--
-- `to_regprocedure` resolves a signature or returns null, so this asks the only question that
-- matters: does a form of this function taking a timestamptz exist at all? A wrapper that accepted
-- `p_now` would let a caller pass `now() + 1 day`, at which point every live lease looks abandoned
-- and two instances pull the same connection -- spending a shared platform quota twice, which
-- 10-credential-model.md prices as halving the number of accounts a developer token supports.
-- ---------------------------------------------------------------------------------------------
select app_test.check('public.due_connections takes no clock from the caller',
  to_regprocedure('public.due_connections(timestamptz, integer)') is null
    and to_regprocedure('public.due_connections(timestamptz)') is null,
  'a caller-supplied future clock offers connections claimed seconds ago');

select app_test.check('public.claim_connection takes no clock from the caller',
  to_regprocedure('public.claim_connection(uuid, text, timestamptz)') is null,
  'a caller-supplied future clock makes every live lease look abandoned');

select app_test.check('public.record_backfill takes no clock from the caller, at any arity',
  to_regprocedure('public.record_backfill(uuid, boolean, timestamptz)') is null
    and to_regprocedure('public.record_backfill(uuid, boolean, text, timestamptz, timestamptz)') is null,
  'a caller-supplied future clock stamps last_backfill_at ahead and suppresses tomorrow''s pull, '
  'and it would also defeat the p_checkpoint > p_now refusal by moving both');

select app_test.check('the two-argument record_backfill is gone, not merely unused',
  to_regprocedure('public.record_backfill(uuid, boolean)') is null,
  'it had no ownership check and no checkpoint, so leaving it callable left both properties '
  'optional');

-- ---------------------------------------------------------------------------------------------
-- SCHEDULING METADATA ONLY, asserted as an exact set.
--
-- For a `returns table` function the column names are the OUT parameters in `proargnames`, marked
-- 't' in `proargmodes`. 02_scheduler.sql asks this of `information_schema.columns`, which holds no
-- row for a function at all -- so that assertion passes vacuously and has always passed. This one
-- cannot: it names the six columns that may come back, and fails on a seventh.
-- ---------------------------------------------------------------------------------------------
do $$
declare
  v_cols text[];
begin
  select array_agg(u.name order by u.ord)
    into v_cols
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace,
         unnest(p.proargnames, p.proargmodes) with ordinality as u(name, mode, ord)
   where n.nspname = 'public' and p.proname = 'due_connections' and u.mode = 't';

  perform app_test.check(
    'the work list returns exactly the six scheduling columns and nothing else',
    v_cols = array['connection_id','workspace_id','organisation_id','provider',
                   'last_backfill_at','restatement_window_days'],
    format('the wrapper returns %s', coalesce(v_cols::text, '(nothing -- is it a table function?)')));

  perform app_test.check(
    'no credential material can come back through the work list',
    not (v_cols && array['credential_ciphertext','credential_iv','wrapped_dek',
                         'external_account_id','developer_token_ciphertext']),
    'enumeration and access are deliberately different privileges: a compromised scheduler learns '
    'which tenants exist, not how to authenticate as any of them');
end $$;

-- ---------------------------------------------------------------------------------------------
-- ANON AND AUTHENTICATED ARE REFUSED -- AT THIS LAYER BY ACL, AND END TO END BY EXECUTION.
--
-- The anon key is public and ships in browsers. An anon-executable `due_connections` would put
-- cross-tenant enumeration on the internet; an anon-executable `claim_connection` would let a
-- stranger hold a lease on every connection on the platform and stop every backfill, fifteen
-- minutes at a time, indefinitely.
--
-- THE EXECUTION TESTS BELOW WERE ONCE THE WHOLE SECTION, AND THEY WERE NOT ENOUGH. An adversarial
-- verifier granted EXECUTE on all three `public` wrappers to BOTH anon and authenticated and re-ran
-- this file: 24 passed, 0 failed -- unchanged. The reason is structural rather than careless. The
-- wrappers are SECURITY INVOKER, so a call by anon reaches `app.due_connections` AS anon, and the
-- inner grant refuses it one layer deeper. `check_refused` sees `insufficient_privilege` and cannot
-- tell which layer raised it. Six assertions, and one of the four properties this file's header
-- claims to prove, passed against a work list the internet could call.
--
-- 07_anon_grants.sql caught that mutation with ten failures, so the system was never unsafe -- but
-- THIS file was not what kept it safe, while saying it was. The ACL block below is what makes the
-- execution block mean what it says: the ACL proves the refusal belongs to THIS layer, the
-- execution proves the refusal is actually enforced, and neither claim is the other one.
-- ---------------------------------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select unnest(array[
      'public.due_connections(integer)',
      'public.claim_connection(uuid, text)',
      'public.record_backfill(uuid, boolean, text, timestamptz)'
    ]) as sig
  loop
    perform app_test.check(
      format('anon holds no EXECUTE on %s ITSELF, not merely on what it calls', r.sig),
      not has_function_privilege('anon', r.sig, 'EXECUTE'),
      'a wrapper the internet may execute still refuses at the inner grant, so every execution '
      'test here would pass while cross-tenant enumeration sat one revoke away');

    perform app_test.check(
      format('authenticated holds no EXECUTE on %s ITSELF', r.sig),
      not has_function_privilege('authenticated', r.sig, 'EXECUTE'),
      'same shape: the refusal must belong to this layer, not be borrowed from the next one');
  end loop;
end $$;
begin;
  select app_test.check_refused('anon cannot call the work list',
    'select count(*) from public.due_connections(10)', 'anon');
  select app_test.check_refused('anon cannot take a lease',
    'select public.claim_connection(''a7400000-0000-4000-8000-000000000001''::uuid, ''forged'')', 'anon');
  select app_test.check_refused('anon cannot close a lease',
    'select public.record_backfill(''a7400000-0000-4000-8000-000000000001''::uuid, true, ''forged'', null)', 'anon');
commit;

begin;
  -- A tenant, with a real membership claim set, so the refusal is about the grant rather than about
  -- an absent identity.
  select set_config('request.jwt.claim.sub', 'a7000000-0000-4000-8000-000000000001', true);

  select app_test.check_refused('a tenant cannot ask the cross-tenant question',
    'select count(*) from public.due_connections(10)', 'authenticated');
  select app_test.check_refused('a tenant cannot take a lease on anything',
    'select public.claim_connection(''a7400000-0000-4000-8000-000000000001''::uuid, ''forged'')', 'authenticated');
  select app_test.check_refused('a tenant cannot close a lease',
    'select public.record_backfill(''a7400000-0000-4000-8000-000000000001''::uuid, true, ''forged'', null)', 'authenticated');
commit;

-- ---------------------------------------------------------------------------------------------
-- AND THE SCHEDULER CAN. A door that is locked to everyone including the scheduler is the failure
-- mode this whole unit exists to end, and it looks exactly like success from the refusals above.
-- ---------------------------------------------------------------------------------------------
begin;
  set local role app_scheduler;

  select app_test.check('the scheduler can read its work list through the wrapper',
    (select count(*) = 2 from public.due_connections(500)
      where workspace_id = 'a7200000-0000-4000-8000-000000000001'));

  -- THE DECLARED TYPE, NOT A VALUE COMPARISON. This assertion used to read
  -- `provider = 'google_ads'`, which is a TAUTOLOGY: PostgreSQL compares an enum against an unknown
  -- literal by coercing the literal, so it answers true whether the column is `text` or
  -- `app.connection_provider`. Verified by running the identical predicate against
  -- `app.due_connections`, which DOES return the enum -- also true. The assertion could not fail.
  --
  -- What actually matters is the DECLARED return type, because that is what PostgREST reads: a type
  -- it cannot resolve arrives as an unexpanded record literal rather than a value, and schema `app`
  -- is deliberately unexposed. So the declaration is asserted off the catalogue.
  select app_test.check('the wrapper DECLARES provider as text, which is what PostgREST can resolve',
    pg_get_function_result('public.due_connections(integer)'::regprocedure) like '%provider text%',
    'a type PostgREST cannot resolve arrives as an unexpanded record literal');

  select app_test.check('and the value still reads correctly through it',
    (select provider = 'google_ads' from public.due_connections(500)
      where connection_id = 'a7400000-0000-4000-8000-000000000001'));
commit;

-- ---------------------------------------------------------------------------------------------
-- THE ARGUMENT REFUSALS. Each one is a silent wrong answer that was available before it.
-- ---------------------------------------------------------------------------------------------
begin;
  select app_test.check_rejected('a limit above the ceiling is refused, not silently clamped',
    'select count(*) from public.due_connections(5000)', 'app_scheduler');
  select app_test.check_rejected('a limit of zero is refused rather than read as "no work"',
    'select count(*) from public.due_connections(0)', 'app_scheduler');
  select app_test.check_rejected('an anonymous lease is refused',
    'select public.claim_connection(''a7400000-0000-4000-8000-000000000001''::uuid, ''   '')',
    'app_scheduler');
  select app_test.check_rejected('an unknown outcome is refused rather than recorded as failure',
    'select public.record_backfill(''a7400000-0000-4000-8000-000000000001''::uuid, null::boolean, ''worker-a'', null)',
    'app_scheduler');
commit;

-- ---------------------------------------------------------------------------------------------
-- THE LEASE, THROUGH THE WRAPPER.
--
-- Both calls are in one transaction on purpose: `now()` is the transaction timestamp, so the second
-- claim happens at the same instant as the first and is unambiguously INSIDE the fifteen-minute
-- lease. Expiry is 02_scheduler.sql's to test, because testing it needs the clock this wrapper
-- refuses to take.
-- ---------------------------------------------------------------------------------------------
begin;
  set local role app_scheduler;

  select app_test.check('the first instance takes the lease',
    (select public.claim_connection('a7400000-0000-4000-8000-000000000001'::uuid, 'worker-a')));

  select app_test.check('the second instance is refused inside the lease',
    (select not public.claim_connection('a7400000-0000-4000-8000-000000000001'::uuid, 'worker-b')),
    'two instances pulling one connection spend a shared platform quota twice');

  select app_test.check('a claimed connection leaves the work list',
    (select count(*) = 0 from public.due_connections(500)
      where connection_id = 'a7400000-0000-4000-8000-000000000001'));
commit;

-- ---------------------------------------------------------------------------------------------
-- CLOSING THE LEASE, both ways.
-- ---------------------------------------------------------------------------------------------
begin;
  set local role app_scheduler;

  -- The return value is the instant recorded, which the caller cannot otherwise know now that the
  -- clock is the database's. It is also what makes this reachable over PostgREST at all: a
  -- `returns void` RPC answers 204 with an empty body, which the store adapter reads as a fault.
  -- A LEASE ANOTHER INSTANCE HOLDS CANNOT BE CLOSED, and the answer is an outcome rather than an
  -- error: the caller needs to learn it lost the race and must not report a failed pull.
  select app_test.check('a lease cannot be closed by an instance that does not hold it',
    (select not (public.record_backfill('a7400000-0000-4000-8000-000000000001'::uuid, true,
       'worker-b', null) ->> 'lease_closed')::boolean),
    'worker-a holds this lease; 20260912000800 recorded the missing ownership check as a known gap');

  -- THE PROPERTY IS THAT THE LEASE SURVIVED, and it is asserted by behaviour rather than by a
  -- proxy. A first draft checked that the connection was still offered by `due_connections`, which
  -- FAILED for a reason that is the design working: a leased connection is not due, so a held lease
  -- and a closed one look identical through that window. `app_scheduler` holds no grant on
  -- `public.connections`, so the honest check is the one that matters operationally -- worker-b
  -- still cannot take a lease worker-a holds.
  select app_test.check('the losing close did not release worker-a''s lease',
    (select not public.claim_connection('a7400000-0000-4000-8000-000000000001'::uuid, 'worker-b')),
    'if the failed close had cleared claimed_at, the next instance would take the lease and two '
    'runs would pull the same connection');

  -- The return value carries the instant recorded, which the caller cannot otherwise know now that
  -- the clock is the database's. It is jsonb rather than a bare timestamp because the caller needs
  -- two facts, and it is not `void` for the reason it never was: PostgREST answers a void RPC with
  -- 204 and an empty body, which the store adapter reads as a fault.
  select app_test.check('closing a lease reports the instant it recorded',
    (select ((public.record_backfill('a7400000-0000-4000-8000-000000000001'::uuid, true,
       'worker-a', now() - interval '2 minutes') ->> 'recorded_at')::timestamptz)
       between now() - interval '1 minute' and now() + interval '1 minute'));

  select app_test.check('a successful run stops the connection being due today',
    (select count(*) = 0 from public.due_connections(500)
      where connection_id = 'a7400000-0000-4000-8000-000000000001'));

  select app_test.check_rejected('a checkpoint in the future is refused through the forwarder',
    'select public.record_backfill(''a7400000-0000-4000-8000-000000000001''::uuid, true, '
    '''worker-a'', ''2030-01-01T00:00:00Z''::timestamptz)', 'app_scheduler');

  select public.claim_connection('a7400000-0000-4000-8000-000000000002'::uuid, 'worker-c');
  select public.record_backfill('a7400000-0000-4000-8000-000000000002'::uuid, false, 'worker-c', null);

  select app_test.check('a failed run is offered again rather than skipped for the day',
    (select count(*) = 1 from public.due_connections(500)
      where connection_id = 'a7400000-0000-4000-8000-000000000002'),
    'record_backfill(false) releases the claim WITHOUT advancing last_backfill_at');
commit;

-- Read outside the scheduler's transaction: it holds no grant on `public.connections`.
begin;
  select app_test.check('a successful run advances the watermark through the forwarder',
    (select ingest_checkpoint is not null
       from public.connections where id = 'a7400000-0000-4000-8000-000000000001'));
commit;

-- ---------------------------------------------------------------------------------------------
-- Put the fixture back. `due_connections` spans tenants, so two connections left permanently due
-- change what any file that runs after this one sees.
-- ---------------------------------------------------------------------------------------------
delete from public.organisations where id = 'a7100000-0000-4000-8000-000000000001';

do $$
declare v_left integer;
begin
  select count(*) into v_left from public.connections
   where workspace_id = 'a7200000-0000-4000-8000-000000000001';
  perform app_test.check('the fixture is gone, so later suites are not dirty', v_left = 0,
    format('%s connection(s) survived the cleanup', v_left));
end $$;

-- ---------------------------------------------------------------------------------------------
-- Summary
--
-- The floor is asserted for the reason given in 06_jwt_claims.sql: a suite that stops running looks
-- exactly like a suite that passes.
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
  if v_failed > 0 then raise exception 'scheduler entry point: % assertion(s) failed', v_failed; end if;
  -- RAISED FROM 20 WITH THE SIX ACL ASSERTIONS AND THE RETURN-TYPE ONE. The floor exists because a
  -- suite that stops running looks exactly like a suite that passes; it is raised deliberately
  -- whenever assertions are added, so a file that quietly loses half its checks is caught.
  if v_total < 27 then
    raise exception 'scheduler entry point: only % assertion(s) ran; expected at least 27', v_total;
  end if;
end $$;
