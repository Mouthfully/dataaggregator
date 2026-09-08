-- The scheduler's entry point.
--
-- THE PROBLEM THIS SOLVES. Every other actor in this schema is a tenant: a human with a membership,
-- or an API key bound to one workspace. Row-level security is defined in terms of that. The
-- scheduler is neither. It is a system actor that must ask "which connections, across every tenant,
-- need pulling right now" -- a question no tenant is allowed to ask, and the exact question RLS
-- exists to make unaskable.
--
-- The usual answer is to hand the scheduler a service-role key, which bypasses RLS entirely. That is
-- ruled out in docs/marketplane/03-supabase-schema-and-rls.md for the same reason it was ruled out
-- for the API edge: a bypass is not a narrower privilege, it is the absence of one, and it would
-- undo every guarantee the policies provide.
--
-- THE ANSWER: a system role whose entire vocabulary is three functions, none of which can reach a
-- credential.
--
--   * `app.due_connections` returns SCHEDULING METADATA ONLY. No ciphertext, no wrapped key, no
--     external account id. Enough to decide what to work on and nothing that could be used to do
--     the work, so a compromised scheduler enumerating everything learns which tenants exist and
--     when they were last pulled -- not a single credential.
--   * `app.claim_connection` takes a lease, so two scheduler instances cannot pull the same
--     connection at once and spend a shared platform quota twice.
--   * `app.record_backfill` closes the lease.
--
-- The credential is fetched separately, per connection, by a caller that already knows which
-- workspace it is acting for. Enumeration and access are deliberately different privileges.

-- A role for the scheduler alone. NOBYPASSRLS is stated explicitly rather than relied on as the
-- default, because the whole design rests on it.
--
-- Named for what it does, never for the product. A database role is created once and renaming it
-- later means rewriting every grant and every connection string, and the product name is explicitly
-- unsettled (docs/marketplane/01-brand-identity.md). The brand guard caught the first attempt at
-- this, which is the second time it has stopped an unsettled name being written somewhere expensive
-- to change -- the vault's AAD was the first.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'app_scheduler') then
    create role app_scheduler nologin noinherit nobypassrls;
  end if;
end $$;

grant usage on schema app to app_scheduler;

-- A lease, so two instances do not pull the same connection at once.
alter table public.connections
  add column if not exists claimed_at timestamptz,
  add column if not exists claimed_by text;

comment on column public.connections.claimed_at is
  'Lease timestamp. A claim older than the lease window is treated as abandoned, because a Worker '
  'that dies mid-backfill cannot release its own lease.';

-- How long a claim is honoured before it is treated as abandoned.
--
-- Cloudflare Workflows allow 15 minutes of wall clock on a cron or queue consumer, so a claim older
-- than that belongs to an instance that is gone. Shorter would let a slow-but-alive run be stolen;
-- much longer would strand a connection after a crash.
create or replace function app.claim_lease_interval()
returns interval language sql immutable as $$ select interval '15 minutes' $$;

/**
 * Connections that need a pull.
 *
 * Returns metadata only. Note what is ABSENT: credential_ciphertext, credential_iv, wrapped_dek,
 * external_account_id. A scheduler needs to know THAT a connection is due, not how to authenticate
 * as it.
 */
create or replace function app.due_connections(
  p_now timestamptz default now(),
  p_limit integer default 100
)
returns table (
  connection_id uuid,
  workspace_id uuid,
  organisation_id uuid,
  provider app.connection_provider,
  last_backfill_at timestamptz,
  restatement_window_days integer
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    c.id,
    c.workspace_id,
    w.organisation_id,
    c.provider,
    c.last_backfill_at,
    c.restatement_window_days
  from public.connections c
  join public.workspaces w on w.id = c.workspace_id
  join public.organisations o on o.id = w.organisation_id
  where c.status = 'active'
    and c.revoked_at is null
    -- A soft-deleted workspace or organisation stops generating work immediately. Otherwise
    -- "delete my data" would keep calling the customer's ad platform on their behalf.
    and w.deleted_at is null
    and o.deleted_at is null
    -- An expired grant is not workable. Pulling with it burns quota to produce a 401, and on Google
    -- Ads a rejected request still counts against a ceiling shared with every other tenant.
    and (c.expires_at is null or c.expires_at > p_now)
    -- Never pulled, or not pulled today.
    and (c.last_backfill_at is null or c.last_backfill_at < date_trunc('day', p_now))
    -- Not currently claimed by a live instance.
    and (c.claimed_at is null or c.claimed_at < p_now - app.claim_lease_interval())
  -- Oldest first, so one busy tenant cannot starve the rest.
  order by c.last_backfill_at asc nulls first, c.id asc
  limit greatest(p_limit, 0);
$$;

/**
 * Take a lease on one connection.
 *
 * Returns true if the claim was taken. The WHERE clause is the lock: two instances racing on the
 * same row means exactly one UPDATE matches, and the loser gets false rather than a duplicate pull.
 * Double-pulling is not merely wasteful here -- it spends a platform quota shared across tenants.
 */
create or replace function app.claim_connection(
  p_connection_id uuid,
  p_claimed_by text,
  p_now timestamptz default now()
)
returns boolean
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_claimed boolean;
begin
  update public.connections
     set claimed_at = p_now,
         claimed_by = p_claimed_by
   where id = p_connection_id
     and status = 'active'
     and revoked_at is null
     and (claimed_at is null or claimed_at < p_now - app.claim_lease_interval())
  returning true into v_claimed;

  return coalesce(v_claimed, false);
end;
$$;

/**
 * Close a lease.
 *
 * `p_succeeded = false` releases the claim WITHOUT advancing last_backfill_at, so a failed run is
 * retried on the next sweep rather than silently skipped for a day. The failure itself is recorded
 * through the connection's status, which is a different concern and a different privilege.
 */
create or replace function app.record_backfill(
  p_connection_id uuid,
  p_succeeded boolean,
  p_now timestamptz default now()
)
returns void
language sql
volatile
security definer
set search_path = public, pg_temp
as $$
  update public.connections
     set last_backfill_at = case when p_succeeded then p_now else last_backfill_at end,
         claimed_at = null,
         claimed_by = null
   where id = p_connection_id;
$$;

-- Only the scheduler role. Not `authenticated`: a tenant must never be able to enumerate across
-- tenants, which is the entire reason these functions are SECURITY DEFINER and separately granted.
revoke all on function app.due_connections(timestamptz, integer) from public, anon, authenticated;
revoke all on function app.claim_connection(uuid, text, timestamptz) from public, anon, authenticated;
revoke all on function app.record_backfill(uuid, boolean, timestamptz) from public, anon, authenticated;

grant execute on function app.due_connections(timestamptz, integer) to app_scheduler;
grant execute on function app.claim_connection(uuid, text, timestamptz) to app_scheduler;
grant execute on function app.record_backfill(uuid, boolean, timestamptz) to app_scheduler;
