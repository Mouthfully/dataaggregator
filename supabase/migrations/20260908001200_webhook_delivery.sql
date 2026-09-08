-- Restatement webhook delivery.
--
-- `26-restatement-outbox.md` built detection and said plainly what it was not: nothing drained the
-- outbox, so the kickoff's gate -- "a tiered restatement backfill and a restatement webhook before
-- any fifth connector" -- was still closed. This is the other half.
--
-- THREE DECISIONS ARE MADE HERE, and each could have gone the other way.
--
-- 1. THE SIGNING SECRET IS NEVER STORED. It is derived, by the delivery worker, from a service key
--    plus this endpoint's id and `secret_version`. So a database dump -- a backup, a read replica,
--    a support export -- contains no signing material at all, which is the leak path that actually
--    happens. The cost is that the service key can derive every endpoint's secret and must live
--    only where the worker runs; `secret_version` exists so one customer's compromised endpoint can
--    be rotated without rotating everyone's.
--
-- 2. THE RETRY SCHEDULE LIVES IN SQL, NOT IN THE WORKER. `app.record_delivery` takes "it worked" or
--    "it did not" and computes the rest. A worker that owned the schedule could set the next
--    attempt to now on every failure and spin, and there would be two copies of the policy for the
--    dictionary guard's successor to fail to check.
--
-- 3. ONE HTTP REQUEST PER EVENT. Batching would cut requests and make partial failure ambiguous:
--    one delivery state per event is what lets a retry mean something. The volume question
--    `26-restatement-outbox.md` section 6 raises is real and is not answered by batching the wire.

-- ---------------------------------------------------------------------------------------------
-- Endpoints
-- ---------------------------------------------------------------------------------------------

create table public.webhook_endpoints (
  id                      uuid primary key default gen_random_uuid(),
  workspace_id            uuid not null references public.workspaces (id) on delete cascade,

  -- https only, checked here rather than trusted to a caller. A webhook carries a customer's own
  -- numbers to a URL they nominated; over http that is their data on the wire in the clear, and the
  -- signature proves origin, not confidentiality.
  url                     text not null check (url ~ '^https://[^[:space:]]+$'),

  -- Bumped to rotate this endpoint's derived secret without touching any other endpoint's.
  secret_version          integer not null default 1 check (secret_version >= 1),

  active                  boolean not null default true,
  description             text,

  created_at              timestamptz not null default now(),
  disabled_at             timestamptz,
  disabled_reason         text,

  constraint webhook_endpoints_disabled_is_inactive check (
    disabled_at is null or not active
  )
);

-- One active endpoint per workspace per URL. A duplicate would deliver everything twice and each
-- copy would retry independently.
create unique index webhook_endpoints_active_url_idx
  on public.webhook_endpoints (workspace_id, url)
  where active;

comment on column public.webhook_endpoints.secret_version is
  'Part of the secret derivation, never a secret itself. Bump to rotate; the previous secret stops '
  'verifying immediately, which is the point.';

alter table public.webhook_endpoints enable row level security;
alter table public.webhook_endpoints force row level security;

-- A member may see where its workspace's webhooks go. Writes are deliberately absent: creating an
-- endpoint mints a secret and is an account-management action, which section 15 puts in server
-- actions rather than in a tenant-writable table.
create policy webhook_endpoints_select on public.webhook_endpoints
  for select to authenticated
  using (app.can_read_workspace(workspace_id));

grant select on public.webhook_endpoints to authenticated;

-- ---------------------------------------------------------------------------------------------
-- The retry schedule
-- ---------------------------------------------------------------------------------------------

-- Deliberately fixed and deterministic, with no jitter. Jitter needs a random source, which makes
-- every assertion about it probabilistic, and the thundering-herd problem jitter solves is bounded
-- here by the batch size the worker claims rather than by the schedule.
--
-- Six attempts spanning about thirty hours. Long enough that an endpoint down for a working day
-- recovers without losing events; short enough that a dead endpoint stops costing requests.
create or replace function app.delivery_backoff(p_attempts integer)
returns interval language sql immutable as $$
  select case p_attempts
    when 1 then interval '1 minute'
    when 2 then interval '5 minutes'
    when 3 then interval '30 minutes'
    when 4 then interval '2 hours'
    when 5 then interval '6 hours'
    else        interval '24 hours'
  end
$$;

create or replace function app.delivery_max_attempts()
returns integer language sql immutable as $$ select 6 $$;

-- ---------------------------------------------------------------------------------------------
-- The delivery role, and the two functions that are its whole vocabulary
-- ---------------------------------------------------------------------------------------------

-- Named for what it does, never for the product: a role is created once and renaming it later means
-- rewriting every grant and connection string, and the name is unsettled (11A.10). The brand guard
-- has already caught this twice.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'app_webhook') then
    create role app_webhook nologin noinherit nobypassrls;
  end if;
end $$;

grant usage on schema app to app_webhook;

-- How long a delivery claim is honoured before it is treated as abandoned. Shorter than the
-- scheduler's fifteen minutes because one HTTP POST is not a backfill: a worker still holding a
-- claim after two minutes is gone, and the event should be retried rather than stranded.
create or replace function app.delivery_lease_interval()
returns interval language sql immutable as $$ select interval '2 minutes' $$;

/*
 * Claim a batch of events that are due, and return them with the endpoint to send them to.
 *
 * RETURNS THE PAYLOAD, AND NO SECRET. The scheduler's `app.due_connections` returns metadata only
 * because a credential would be the prize; here the event content IS the payload and there is
 * nothing else to withhold -- the signing secret is derived by the worker and never enters the
 * database at all. That is the property decision 1 in the header buys.
 *
 * `for update skip locked` so two workers claim disjoint batches instead of blocking on each other.
 */
create or replace function app.due_restatement_events(
  p_claimed_by text,
  p_limit integer default 50,
  p_now timestamptz default now()
)
returns table (
  event_id            uuid,
  endpoint_id         uuid,
  endpoint_url        text,
  secret_version      integer,
  workspace_id        uuid,
  attempts            integer,
  payload             jsonb
)
language sql
volatile
security definer
set search_path = public, pg_temp
as $$
  with due as (
    select e.id
      from public.restatement_events e
      join public.webhook_endpoints w
        on w.workspace_id = e.workspace_id and w.active
     where e.delivered_at is null
       and e.failed_at is null
       and e.next_attempt_at <= p_now
       and (e.claimed_at is null or e.claimed_at < p_now - app.delivery_lease_interval())
     order by e.occurred_at
     limit greatest(p_limit, 0)
     for update of e skip locked
  ),
  claimed as (
    update public.restatement_events e
       set claimed_at = p_now, claimed_by = p_claimed_by
      from due
     where e.id = due.id
    returning e.*
  )
  select
    c.id,
    w.id,
    w.url,
    w.secret_version,
    c.workspace_id,
    c.attempts,
    jsonb_build_object(
      'type', 'restated',
      'id', c.id,
      'workspace_id', c.workspace_id,
      'occurred_at', c.occurred_at,
      'source', c.source,
      'entity', jsonb_build_object(
        'type', c.entity_type, 'id', c.entity_id, 'account_id', c.account_id
      ),
      'dimensions', jsonb_build_object(
        'date', c.date, 'currency', c.currency, 'attribution_window', c.attribution_window
      ),
      'metrics', c.metrics,
      'revised_from', c.revised_from,
      'fetched_at', c.fetched_at,
      'first_seen_at', c.first_seen_at,
      'restates_until', c.restates_until,
      'is_provisional', c.is_provisional
    )
  from claimed c
  join public.webhook_endpoints w
    on w.workspace_id = c.workspace_id and w.active;
$$;

/*
 * Close one delivery attempt.
 *
 * The whole retry policy is here, and nowhere else. A success is terminal. A failure increments the
 * attempt count and either schedules the next attempt from `app.delivery_backoff` or, once the
 * attempts are spent, sets `failed_at` and stops -- an event that retries forever is an endpoint
 * that is never noticed to be broken.
 *
 * The claim is released either way, so a crashed worker's event returns to the queue when its lease
 * expires and a finished one does not wait for it.
 */
create or replace function app.record_delivery(
  p_event_id uuid,
  p_ok boolean,
  p_status integer default null,
  p_error text default null,
  p_now timestamptz default now()
)
returns boolean
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_attempts integer;
  v_done boolean;
begin
  if p_ok then
    update public.restatement_events
       set delivered_at = p_now,
           attempts     = attempts + 1,
           last_error   = null,
           claimed_at   = null,
           claimed_by   = null
     where id = p_event_id and delivered_at is null and failed_at is null
    returning true into v_done;
    return coalesce(v_done, false);
  end if;

  select attempts + 1 into v_attempts
    from public.restatement_events
   where id = p_event_id and delivered_at is null and failed_at is null;

  if v_attempts is null then
    return false;
  end if;

  update public.restatement_events
     set attempts        = v_attempts,
         last_error      = left(coalesce(p_status::text || ' ' || coalesce(p_error, ''), p_error, 'unknown'), 500),
         -- Spent. Stop, and leave the count and the error behind as the record of why.
         failed_at       = case when v_attempts >= app.delivery_max_attempts() then p_now end,
         next_attempt_at = case
           when v_attempts >= app.delivery_max_attempts() then next_attempt_at
           else p_now + app.delivery_backoff(v_attempts)
         end,
         claimed_at      = null,
         claimed_by      = null
   where id = p_event_id;

  return true;
end;
$$;

revoke all on function app.due_restatement_events(text, integer, timestamptz)
  from public, anon, authenticated;
revoke all on function app.record_delivery(uuid, boolean, integer, text, timestamptz)
  from public, anon, authenticated;

grant execute on function app.due_restatement_events(text, integer, timestamptz) to app_webhook;
grant execute on function app.record_delivery(uuid, boolean, integer, text, timestamptz) to app_webhook;
