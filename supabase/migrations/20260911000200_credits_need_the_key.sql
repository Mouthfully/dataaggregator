-- Spending a tenant's credits requires the key, not a uuid that names the row.
--
-- WHAT WAS WRONG (issue #19). 20260908000800_api_key_verification.sql states an invariant on
-- `verify_api_key` -- "the only anon-executable function in the schema" -- and thirty lines below
-- it grants `consume_api_key_credits(uuid, integer)` to `anon` as well. That is not a stale
-- comment. The two functions differ in exactly the property that decides whether an `anon` grant
-- is sound:
--
--   verify_api_key           READS, and is gated on a SHA-256 hash of the key. Producing the
--                            argument IS the proof of possession, so the grant costs nothing.
--   consume_api_key_credits  WRITES, and was gated on an `api_key_id`. A uuid is an identifier,
--                            not a secret. It turns up in logs, error payloads, support tickets
--                            and admin screens, and nothing in the schema treats it as sensitive.
--
-- The anon key is public by design; it ships in browsers. So the entire authorisation for driving
-- a workspace's `credits_used` to its monthly ceiling was knowing a uuid, after which section 8's
-- hard spend cap works exactly as specified -- against the victim. The key stops working. A v4
-- uuid is not guessable, so this was never trivially exploitable; it was exploitable by anyone who
-- read a log line.
--
-- THE DECISION is option 2 of the issue: take the hash instead of the id, so the caller proves
-- possession rather than naming a row. `api_keys.key_hash` is UNIQUE, so the lookup is the same
-- single indexed row it always was, and the two-call shape the edge already needs is unchanged --
-- it hashed the presented key to call `verify_api_key`, and now passes the same bytes back.
--
-- Option 1 (charge inside `verify_api_key`) was rejected because it cannot express the thing
-- section 8 actually promises: a failed call is never billed, so the charge has to happen after
-- the work, and verification happens before it. Folding them together would either bill work that
-- did not happen or require a refund path, which is a ledger nobody asked for. Option 3 (keep the
-- grant, fix the comment) was rejected because it is only defensible with a stated reason why an
-- `api_key_id` is a secret, and there is none -- `verify_api_key` deliberately does not return the
-- hash but does return the id, precisely because the id was never treated as sensitive.
--
-- There is no caller: `/v1/performance` returns 503 and no store adapter exists. The signature is
-- free to change today and will not be tomorrow.
--
-- WHY THE SIGNATURE CHANGE IS A DROP, NOT A REPLACE. `create or replace function` with different
-- argument types creates an OVERLOAD; the id-keyed function -- and its `anon` grant -- would still
-- be there, which is the defect surviving the fix. Dropping takes the grant with it.

drop function if exists public.consume_api_key_credits(uuid, integer);

-- Credit spend, charged after the work is done.
--
-- Separate from verification because a failed call is never billed (specification section 8), so
-- the charge cannot happen at authorisation time. Returns false when the budget would be exceeded,
-- which is how a hard spend cap differs from an alert.
create function public.consume_api_key_credits(p_key_hash bytea, p_credits integer)
returns boolean
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_ok boolean;
begin
  -- A malformed hash is a client bug, not a lookup. The same guard `verify_api_key` carries, and
  -- here it is also what stops a caller probing the table with odd-length values.
  if p_key_hash is null or octet_length(p_key_hash) <> 32 then
    return false;
  end if;

  if p_credits is null or p_credits < 0 then
    return false;
  end if;

  -- Roll the period first, so a key does not carry last month's spend into this month's ceiling.
  update public.api_keys
     set credits_used = 0,
         budget_period_start = date_trunc('month', now())::date
   where key_hash = p_key_hash
     and budget_period_start < date_trunc('month', now())::date;

  update public.api_keys
     set credits_used = credits_used + p_credits
   where key_hash = p_key_hash
     and revoked_at is null
     and (monthly_credit_budget is null
          or credits_used + p_credits <= monthly_credit_budget)
  returning true into v_ok;

  return coalesce(v_ok, false);
end;
$$;

revoke all on function public.consume_api_key_credits(bytea, integer) from public;
grant execute on function public.consume_api_key_credits(bytea, integer) to anon, authenticated;

-- THE INVARIANT, RESTATED IN THE DATABASE ITSELF.
--
-- 20260908000800 has been applied to a live project and is not editable, so its comment still says
-- "the only anon-executable function". `comment on function` is the one way to correct what the
-- project reports without rewriting history, and a comment that disagrees with the grant beside it
-- is how this defect lasted thirty lines in the first place.
comment on function public.verify_api_key(bytea) is
  'Edge key verification. Takes a SHA-256 hash, never a plaintext key. One of exactly two '
  'anon-executable functions in the schema -- the other is consume_api_key_credits(bytea, integer) '
  '-- and the reason the API edge needs no service-role key. Both are gated on possession of the '
  'key hash. supabase/tests/07_anon_grants.sql fails if a third ever appears.';

comment on function public.consume_api_key_credits(bytea, integer) is
  'Credit spend, charged after the work is done. Takes the SHA-256 hash of the key, never its id: '
  'the argument is the proof of possession, and that is the only reason an anon grant on a '
  'function that WRITES is defensible. Issue #19.';

-- WHAT THIS FILE DELIBERATELY DOES NOT DO, AND WHY IT CANNOT.
--
-- 20260911000100_anon_has_nothing.sql fixed the equivalent class for TABLES with two statements --
-- revoke what is granted, then change the default so a future migration's table never receives the
-- grant. There is no analogue for functions, and it is worth writing down rather than leaving the
-- next reader to discover it:
--
--   alter default privileges in schema public revoke all on functions from anon;   -- insufficient
--   alter default privileges in schema public revoke all on functions from public; -- no effect
--
-- PostgreSQL's BUILT-IN default ACL for a function grants EXECUTE to PUBLIC, and `alter default
-- privileges` is merged ON TOP of it rather than replacing it: observed on this schema, a function
-- created after both statements above still lands with `=X/postgres` in its ACL, and `anon` is a
-- member of PUBLIC. So every function created in `public` is anon-executable the moment it exists,
-- and the ONLY defence is the explicit `revoke all ... from public` that each of these four
-- functions carries.
--
-- That is precisely why the enforcement lives in the test suite instead. `07_anon_grants.sql` now
-- enumerates the anon-executable functions in `public` off pg_proc and fails on the third, so a
-- future migration that forgets its revoke fails the build rather than shipping an unauthenticated
-- entry point that nobody wrote down.
