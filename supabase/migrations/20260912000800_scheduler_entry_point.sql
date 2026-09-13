-- The scheduler entry point: how a cron tick reaches the scheduler's three functions at all.
--
-- THE PROBLEM THIS SOLVES, and it is the same shape 20260912000300_ingest_entry_point.sql solved
-- for the write path. `app_scheduler` has existed since 20260908001000 with a vocabulary of exactly
-- three functions, and nothing has ever called one of them, because nothing CAN:
--
--   * `app.due_connections`, `app.claim_connection` and `app.record_backfill` live in schema `app`,
--     and supabase/config.toml exposes only `public` to PostgREST -- deliberately: "the tenancy
--     helpers in `app` are a privilege boundary, not an API".
--   * PostgREST is the only database transport in this monorepo. There is no Hyperdrive binding, no
--     Postgres driver and no service-role key.
--   * `app_scheduler` is NOLOGIN and nothing granted it to `authenticator`, so PostgREST could not
--     assume it even if a token asked for it.
--   * `packages/store/src/jwt.ts` could not even mint a token naming the role.
--
-- So no cron can do real work, no connector can be pulled on a schedule, and no brief can ever be
-- sent. `app.due_connections` is called by exactly one thing today: supabase/tests/02_scheduler.sql.
--
-- WHY FORWARDERS IN `public` AND NOT THE OBVIOUS ALTERNATIVES. Identical reasoning to the ingest
-- entry point, and it is not repeated here at length: exposing `app` in config.toml would make
-- every function in it addressable by any tenant holding a token, with per-function ACLs as the
-- only barrier -- and PostgreSQL grants EXECUTE on a NEW function to PUBLIC by default, which
-- 20260912000200_position.sql records as an incident that has already happened in this schema. A
-- direct connection through Hyperdrive remains the deferred answer and is a larger change than the
-- thing it would unblock.
--
-- SECURITY INVOKER, DELIBERATELY, for all three. The `app.` functions are already SECURITY DEFINER,
-- so they are what reaches the table; these wrappers do not need to be, and making them DEFINER
-- would widen the blast radius of a future mistake here for no benefit. The tenant invariant holds
-- three deep exactly as it does for ingest: a tenant cannot execute these wrappers (revoked below),
-- cannot execute the `app` functions (revoked in their own migration), and `app_scheduler`'s own
-- grants stop at these three functions -- 02_scheduler.sql proves it cannot read `connections`,
-- `api_keys`, `members` or `organisations` directly.
--
-- THE HONEST COST, stated here rather than discovered in review, and it is LARGER than the ingest
-- one. `SUPABASE_JWT_SECRET` already became a write credential when `public.ingest_envelope_rows`
-- shipped. It now also becomes a CROSS-TENANT ENUMERATION credential: anything that can mint a
-- token can ask which connections exist across every tenant and when each was last pulled. That is
-- precisely the question row-level security exists to make unaskable, and the mitigation is the one
-- the scheduler was designed around rather than a new one -- enumeration and access are different
-- privileges, so what leaks is a list of workspace ids and timestamps and NOT ONE CREDENTIAL. The
-- wrappers below are written to keep that true, which is what most of this file is about.

-- ---------------------------------------------------------------------------------------------
-- PostgREST must be able to assume the scheduler role.
--
-- `authenticator` is the login role PostgREST connects as; it serves a request by SET LOCAL ROLE to
-- whatever the token's `role` claim names, and that only works for a role it is a MEMBER of. Same
-- guard and same reason as the ingest entry point's: `authenticator` is Supabase-provided, present
-- on a real project and supplied locally by 00_supabase_shim.sql. Without this grant PostgREST
-- fails the SET ROLE and the error surfaces as a rejected token, which sends whoever hits it
-- looking at the signing secret rather than at role membership.
--
-- `authenticator` is NOINHERIT, which is what keeps this from being a general widening: it can
-- SET ROLE to app_scheduler when a token says so, and holds none of its privileges passively on an
-- ordinary tenant request. 07_anon_grants.sql asserts that property rather than trusting it.
-- ---------------------------------------------------------------------------------------------
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'authenticator') then
    grant app_scheduler to authenticator;
  end if;
end $$;

-- PostgreSQL grants USAGE on schema `public` to PUBLIC by default and `app_scheduler` inherits that
-- as a member of PUBLIC, so this is belt and braces -- but the default is a thing a hardened
-- project revokes, and a revoked USAGE would present as "every scheduler call is denied" with
-- three perfectly correct function grants in place.
grant usage on schema public to app_scheduler;

-- ---------------------------------------------------------------------------------------------
-- THE CLOCK IS NOT A PARAMETER HERE, AND THAT IS THE SHARPEST DECISION IN THIS FILE.
--
-- All three `app.` functions take `p_now`, and they are right to: 02_scheduler.sql drives a fixed
-- timeline through them and could not test the 15-minute lease at all otherwise. But those
-- functions are reachable only by a role nothing could assume. These wrappers are reachable over
-- the network by anything holding the signing secret, and a caller-supplied clock on THIS side is
-- not a testing seam, it is a lease bypass:
--
--   * `app.claim_connection` treats a claim as abandoned when `claimed_at < p_now - 15 minutes`.
--     Pass `p_now = now() + 1 day` and EVERY live lease looks abandoned, so two instances pull the
--     same connection and spend a shared platform quota twice -- the exact failure the lease exists
--     to prevent, reachable by typing a different argument.
--   * `app.due_connections` offers a connection claimed seconds ago under the same future clock.
--   * `app.record_backfill` would stamp `last_backfill_at` in the future, suppressing tomorrow's
--     pull -- a connection that silently stops being backfilled, which is this product's worst
--     failure mode because the numbers stay plausible.
--
-- So the wrappers take no clock and always pass `now()`. The scheduler has no legitimate use for a
-- clock the database does not already have, and supabase/tests/13_scheduler_entry_point.sql asserts
-- the SIGNATURES carry no timestamptz rather than asserting a behaviour, because the moment one
-- reappears the property is gone whatever the body does.
-- ---------------------------------------------------------------------------------------------

/**
 * Connections that need a pull. SCHEDULING METADATA ONLY.
 *
 * WHAT IS ABSENT IS THE POINT, and this wrapper widens nothing: no credential_ciphertext, no
 * credential_iv, no wrapped_dek, no external_account_id. 20260908001000_scheduler.sql states the
 * rule this function exists under -- "enumeration and access are deliberately different privileges"
 * -- so a compromised scheduler learns which tenants exist and when they were last pulled, and not
 * one credential. The credential is fetched separately, per connection, by a caller that already
 * knows which workspace it is acting for; `packages/store/src/connections.ts` is that caller and it
 * reaches the row as `authenticated` under row-level security.
 *
 * `provider` IS RETURNED AS `text`, NOT AS `app.connection_provider`. Same reason the ingest
 * forwarder takes its three enums as text: the type is declared in a schema PostgREST cannot see,
 * and `packages/store/src/authenticator.ts` already carries the warning about what an unresolvable
 * type does to a response -- it comes back as an unexpanded record literal rather than a value. The
 * adapter narrows the text against `PROVIDER_LANES` on arrival, which it must do anyway: the enum
 * carries nine members and this build can drive five.
 *
 * `p_limit` ABOVE THE CEILING IS REFUSED RATHER THAN CLAMPED. A clamped limit returns fewer rows
 * than were asked for and says nothing, and a scheduler cannot tell a short answer from a finished
 * one -- it would conclude the sweep is complete and leave real work unpulled until the next tick,
 * every tick, forever. The ceiling itself is set well under config.toml's `max_rows = 1000`,
 * because PostgREST truncates any larger result at that number and is equally silent about it.
 */
create function public.due_connections(p_limit integer default 100)
returns table (
  connection_id           uuid,
  workspace_id            uuid,
  organisation_id         uuid,
  provider                text,
  last_backfill_at        timestamptz,
  restatement_window_days integer
)
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $fn$
begin
  if p_limit is null or p_limit < 1 or p_limit > 500 then
    raise exception
      'due_connections: p_limit must be between 1 and 500, got %. Refusing rather than clamping: a '
      'short work list a scheduler cannot distinguish from a finished one leaves work unpulled.',
      coalesce(p_limit::text, 'null')
      using errcode = '22023';
  end if;

  -- Every column qualified with `d.`, because the OUT parameters above share these names and an
  -- unqualified reference inside PL/pgSQL resolves to the variable rather than the column.
  return query
    select
      d.connection_id,
      d.workspace_id,
      d.organisation_id,
      d.provider::text,
      d.last_backfill_at,
      d.restatement_window_days
    from app.due_connections(now(), p_limit) d;
end;
$fn$;

/**
 * Take a lease on one connection. True if this caller now holds it.
 *
 * `p_claimed_by` IS REQUIRED AND MUST NAME SOMETHING. The inner function would accept null or an
 * empty string happily and write it to `connections.claimed_by`, which turns the lease into an
 * anonymous one: an operator looking at a connection stuck for fifteen minutes has no way to tell
 * which instance is holding it, and that column exists for no other purpose. Bounded too, because
 * it is free text from a caller landing in a row every later sweep reads.
 */
create function public.claim_connection(p_connection_id uuid, p_claimed_by text)
returns boolean
language plpgsql
volatile
security invoker
set search_path = public, pg_temp
as $fn$
declare
  v_claimed_by text := btrim(coalesce(p_claimed_by, ''));
begin
  if p_connection_id is null then
    raise exception 'claim_connection: p_connection_id is required'
      using errcode = '22023';
  end if;
  if v_claimed_by = '' then
    raise exception
      'claim_connection: p_claimed_by must name the instance taking the lease; an anonymous lease '
      'cannot be attributed when a connection is found stuck.'
      using errcode = '22023';
  end if;
  if length(v_claimed_by) > 200 then
    raise exception 'claim_connection: p_claimed_by is longer than 200 characters'
      using errcode = '22023';
  end if;

  return app.claim_connection(p_connection_id, v_claimed_by, now());
end;
$fn$;

/**
 * Close a lease. Returns the instant that was recorded.
 *
 * IT RETURNS A TIMESTAMP RATHER THAN `void`, FOR TWO REASONS AND NEITHER IS DECORATION. The wrapper
 * took the clock away from the caller, so the caller genuinely cannot otherwise know what instant
 * `last_backfill_at` now holds -- and that is the value a scheduler logs and the value that decides
 * whether this connection is due again tomorrow. The second reason is transport: PostgREST answers
 * a `returns void` RPC with `204 No Content` and an empty body, which the store adapter's one
 * shared response path reads as "the database answered with a body that is not JSON". A `void`
 * wrapper would have been a function that worked and an adapter that always reported failure.
 *
 * `p_succeeded` MUST NOT BE NULL. `app.record_backfill` reads it as `case when p_succeeded then ...`
 * , so a null falls to the else branch and is silently recorded as a FAILURE: the connection is
 * offered again on the next sweep and the platform is called twice for data already stored. An
 * unknown outcome is a caller bug, and the caller is a Worker that always knows which way its own
 * run went.
 *
 * WHAT THIS DELIBERATELY DOES NOT FIX, stated so it is a known gap rather than a discovery:
 * `app.record_backfill` does not check WHO holds the lease, so an instance whose lease expired
 * mid-run can still close the lease a different instance has since taken. Fixing that needs a
 * `p_claimed_by` on the inner function -- a change to 20260908001000's own signature and its tests
 * -- and doing it here instead would need this wrapper to reach `public.connections` directly, as
 * SECURITY DEFINER, which is the widening the whole file argues against. The 15-minute lease is
 * matched to Cloudflare's wall-clock limit precisely so that the window is narrow.
 */
create function public.record_backfill(p_connection_id uuid, p_succeeded boolean)
returns timestamptz
language plpgsql
volatile
security invoker
set search_path = public, pg_temp
as $fn$
declare
  -- Read once and both passed and returned, so the value reported is the value recorded. `now()` is
  -- the transaction timestamp and would agree anyway; binding it makes that structural.
  v_now timestamptz := now();
begin
  if p_connection_id is null then
    raise exception 'record_backfill: p_connection_id is required'
      using errcode = '22023';
  end if;
  if p_succeeded is null then
    raise exception
      'record_backfill: p_succeeded must be true or false. A null is recorded as a FAILURE and the '
      'connection is pulled again tomorrow for data already stored.'
      using errcode = '22023';
  end if;

  perform app.record_backfill(p_connection_id, p_succeeded, v_now);
  return v_now;
end;
$fn$;

-- ---------------------------------------------------------------------------------------------
-- THE REVOKE, WHICH IS THE WHOLE SECURITY PROPERTY.
--
-- PostgreSQL's BUILT-IN default ACL grants EXECUTE on a new function to PUBLIC, and `alter default
-- privileges` cannot revoke it -- 20260911000200_credits_need_the_key.sql establishes that by
-- experiment, 20260912000200_position.sql records an incident where omitting exactly these
-- statements made three assertions fail with "POLICY BYPASS", and 07_anon_grants.sql exists because
-- of it. So `public` is named here and not merely `anon`: `anon` and `authenticated` are members of
-- PUBLIC, and revoking from them while PUBLIC still holds the grant changes nothing at all.
--
-- Without these three lines, `anon` could execute all three. The anon key is public by design and
-- ships in browsers, so that would put cross-tenant enumeration -- which connections exist in every
-- workspace on the platform, and when each was last pulled -- on the internet, and would let a
-- stranger take and hold leases on every connection in the system, stopping every backfill for
-- fifteen minutes at a time indefinitely.
-- ---------------------------------------------------------------------------------------------
revoke all on function public.due_connections(integer) from public, anon, authenticated;
revoke all on function public.claim_connection(uuid, text) from public, anon, authenticated;
revoke all on function public.record_backfill(uuid, boolean) from public, anon, authenticated;

-- service_role ALSO HOLDS EXECUTE ON ALL THREE, and saying so here is the point of this comment.
--
-- Three `comment on function` statements below used to end "Executable ONLY by app_scheduler",
-- which is false: `00_supabase_shim.sql` carries Supabase's own
-- `alter default privileges in schema public grant all on functions to anon, authenticated,
-- service_role`, and the revoke above names `public, anon, authenticated` -- not service_role. The
-- live ACL on each is {postgres=X, service_role=X, app_scheduler=X}.
--
-- IT IS NOT AN ESCALATION, and it is left in place deliberately rather than quietly revoked.
-- service_role is BYPASSRLS: it can already read `public.connections` directly, credentials
-- included, so reaching the same rows through a wrapper that returns six scheduling columns takes
-- nothing it did not have. The shipped ingest entry point has the identical shape.
--
-- What was wrong was the SENTENCE, not the grant. A comment that overstates a boundary is worse
-- than one that states it loosely, because the next person reasons from it: someone reading "ONLY
-- app_scheduler" would conclude a service-role leak cannot reach the work list, and be wrong. The
-- comments now say "of the tenant roles", which is what is actually enforced and what
-- 07_anon_grants.sql and 13_scheduler_entry_point.sql actually assert.
grant execute on function public.due_connections(integer) to app_scheduler;
grant execute on function public.claim_connection(uuid, text) to app_scheduler;
grant execute on function public.record_backfill(uuid, boolean) to app_scheduler;

comment on function public.due_connections(integer) is
  'The scheduler''s work list. Forwards to app.due_connections, which PostgREST cannot reach '
  'because schema `app` is deliberately unexposed. SCHEDULING METADATA ONLY -- no ciphertext, no '
  'wrapped key, no external account id: enumeration and access are different privileges. Takes no '
  'clock; `now()` is the database''s. Of the tenant roles, executable by app_scheduler alone.';

comment on function public.claim_connection(uuid, text) is
  'Takes the 15-minute lease that stops two instances pulling one connection and spending a shared '
  'platform quota twice. Takes no clock, because a caller-supplied future clock makes every live '
  'lease look abandoned. Of the tenant roles, executable by app_scheduler alone.';

comment on function public.record_backfill(uuid, boolean) is
  'Closes a lease and returns the instant recorded. p_succeeded = false releases the claim without '
  'advancing last_backfill_at, so a failed run is retried rather than skipped for a day. Takes no '
  'clock. Of the tenant roles, executable by app_scheduler alone.';
