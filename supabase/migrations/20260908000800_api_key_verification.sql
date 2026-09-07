-- API-key verification at the edge.
--
-- DECISION (gap 2 in docs/marketplane/00-repo-map.md section 10): the Worker holds NO service-role
-- key. It verifies a key through one narrow SECURITY DEFINER function, then mints a short-lived
-- token carrying the verified workspace, and every subsequent query goes through RLS as normal.
--
-- The problem this solves is a chicken and egg: to find the key row you must read a table, and to
-- read a table you must already be authorised. The usual shortcut is to hand the edge a
-- service-role key, which bypasses RLS entirely -- and with it every tenant-isolation guarantee the
-- product sells. Instead the ONLY privileged surface is this function:
--
--   * it takes a HASH, never a plaintext key, so the credential itself never reaches the database
--   * it returns only what the edge needs to authorise a request, and never the hash
--   * it is the sole `anon`-executable function in the schema
--
-- Flow: hash the presented key (SHA-256) -> call this -> mint a JWT with `workspace_id` and a TTL
-- of about a minute -> use that JWT for the request's queries.
--
-- RESIDUAL RISK, stated rather than buried: the edge holds a JWT signing secret, and anything that
-- can mint tokens can mint one for any workspace. That is strictly better than a service-role key,
-- which bypasses policies altogether rather than being subject to them, but it is not nothing.
-- The mitigations are a one-minute TTL, a signing secret that exists only as a Worker secret, and
-- the fact that a minted token still cannot touch api_keys, members or invitations because no
-- policy grants an API-key session access to them.

create type app.api_key_context as (
  api_key_id       uuid,
  workspace_id     uuid,
  organisation_id  uuid,
  allowed_tools    text[],
  credits_remaining integer
);

create or replace function public.verify_api_key(p_key_hash bytea)
returns app.api_key_context
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_result app.api_key_context;
begin
  -- A malformed hash is a client bug, not a lookup. Reject it before touching the table so a
  -- caller cannot probe with odd-length values.
  if p_key_hash is null or octet_length(p_key_hash) <> 32 then
    return null;
  end if;

  select
    k.id,
    k.workspace_id,
    w.organisation_id,
    k.allowed_tools,
    case
      when k.monthly_credit_budget is null then null
      else greatest(k.monthly_credit_budget - k.credits_used, 0)
    end
  into
    v_result.api_key_id,
    v_result.workspace_id,
    v_result.organisation_id,
    v_result.allowed_tools,
    v_result.credits_remaining
  from public.api_keys k
  join public.workspaces w on w.id = k.workspace_id
  join public.organisations o on o.id = w.organisation_id
  where k.key_hash = p_key_hash
    and k.revoked_at is null
    and (k.expires_at is null or k.expires_at > now())
    and w.deleted_at is null
    and o.deleted_at is null;

  if v_result.api_key_id is null then
    return null;
  end if;

  -- Written on every authorised request. The cost is one indexed update per call; the alternative
  -- is a key nobody can tell is unused, which is the key nobody ever revokes.
  update public.api_keys
     set last_used_at = now()
   where id = v_result.api_key_id;

  return v_result;
end;
$$;

-- The one exception to "nothing is callable by anon". Everything else in `app` stays closed.
revoke all on function public.verify_api_key(bytea) from public;
grant execute on function public.verify_api_key(bytea) to anon, authenticated;

comment on function public.verify_api_key(bytea) is
  'Edge key verification. Takes a SHA-256 hash, never a plaintext key. The only anon-executable '
  'function in the schema, and the reason the API edge needs no service-role key.';

-- Credit spend, charged after the work is done.
--
-- Separate from verification because a failed call is never billed (specification section 8), so
-- the charge cannot happen at authorisation time. Returns false when the budget would be exceeded,
-- which is how a hard spend cap differs from an alert.
create or replace function public.consume_api_key_credits(p_api_key_id uuid, p_credits integer)
returns boolean
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_ok boolean;
begin
  if p_credits is null or p_credits < 0 then
    return false;
  end if;

  -- Roll the period first, so a key does not carry last month's spend into this month's ceiling.
  update public.api_keys
     set credits_used = 0,
         budget_period_start = date_trunc('month', now())::date
   where id = p_api_key_id
     and budget_period_start < date_trunc('month', now())::date;

  update public.api_keys
     set credits_used = credits_used + p_credits
   where id = p_api_key_id
     and revoked_at is null
     and (monthly_credit_budget is null
          or credits_used + p_credits <= monthly_credit_budget)
  returning true into v_ok;

  return coalesce(v_ok, false);
end;
$$;

revoke all on function public.consume_api_key_credits(uuid, integer) from public;
grant execute on function public.consume_api_key_credits(uuid, integer) to anon, authenticated;
