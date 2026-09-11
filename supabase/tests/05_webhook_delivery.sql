-- Restatement webhook delivery tests.
--
-- `04_restatement_events.sql` proves the outbox fills correctly and stays silent when nothing moved.
-- This proves it drains: that a claim is exclusive, that a lease expires, that a failure is retried
-- on a schedule and eventually stops, and that a tenant can see where its webhooks go without being
-- able to point one somewhere else.

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

create or replace function app_test.check_denied(p_name text, p_sql text)
returns void language plpgsql as $$
declare v_rows bigint;
begin
  execute p_sql;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    perform app_test.check(p_name, true, 'denied by row filter: 0 rows affected');
  else
    perform app_test.check(p_name, false, format('POLICY BYPASS: affected %s row(s)', v_rows));
  end if;
exception
  when insufficient_privilege or check_violation then
    perform app_test.check(p_name, true, 'denied by policy: ' || sqlerrm);
  when others then
    perform app_test.check(p_name, false, 'unexpected error: ' || sqlerrm);
end;
$$;

create or replace function app_test.check_rejected(p_name text, p_sql text)
returns void language plpgsql as $$
begin
  execute p_sql;
  perform app_test.check(p_name, false, 'ACCEPTED: the database allowed a row it must refuse');
exception
  when check_violation or not_null_violation or invalid_text_representation
    or unique_violation then
    perform app_test.check(p_name, true, 'refused: ' || sqlerrm);
  when others then
    perform app_test.check(p_name, false, 'wrong error: ' || sqlerrm);
end;
$$;

grant usage on schema app_test to authenticated, anon, app_scheduler, app_ingest, app_webhook;
grant all on app_test.results to authenticated, anon, app_scheduler, app_ingest, app_webhook;
grant usage, select on all sequences in schema app_test to authenticated, anon, app_scheduler, app_ingest, app_webhook;
grant execute on all functions in schema app_test to authenticated, anon, app_scheduler, app_ingest, app_webhook;

-- Fixture: ids distinct from every other suite here.
insert into auth.users (id, email) values
  ('61111111-1111-1111-1111-111111111111', 'hook-alice@northwind.test'),
  ('63333333-3333-3333-3333-333333333333', 'hook-carol@contoso.test')
on conflict do nothing;

insert into public.organisations (id, name, slug) values
  ('6aaaaaaa-0000-0000-0000-000000000001', 'Northwind Agency', 'northwind-hook'),
  ('6bbbbbbb-0000-0000-0000-000000000002', 'Contoso Brand', 'contoso-hook');

insert into public.workspaces (id, organisation_id, name, slug) values
  ('6c000000-0000-0000-0000-000000000001', '6aaaaaaa-0000-0000-0000-000000000001', 'Client One', 'client-one-hook'),
  ('6c000000-0000-0000-0000-000000000002', '6bbbbbbb-0000-0000-0000-000000000002', 'Contoso', 'contoso-hook');

insert into public.members (id, organisation_id, user_id, role) values
  ('6d000000-0000-0000-0000-000000000001', '6aaaaaaa-0000-0000-0000-000000000001', '61111111-1111-1111-1111-111111111111', 'owner'),
  ('6d000000-0000-0000-0000-000000000002', '6bbbbbbb-0000-0000-0000-000000000002', '63333333-3333-3333-3333-333333333333', 'owner');

-- One event per workspace, produced the way a real one is: a write, then a write that moves a
-- metric. Never inserted directly -- the trigger is the only writer, and a suite that bypassed it
-- would be testing a table rather than the feature.
create or replace function app_test.make_event(p_workspace uuid, p_entity text, p_before numeric, p_after numeric)
returns void language plpgsql as $$
begin
  perform app.upsert_envelope_row(
    p_workspace_id => p_workspace, p_connection_id => null, p_source => 'meta_ads',
    p_account_id => 'act_1', p_entity_id => p_entity, p_entity_type => 'ad_group',
    p_native_entity_type => 'adset', p_native_id => '1',
    p_date => '2026-08-14', p_currency => 'EUR', p_timezone => 'Europe/Berlin',
    p_attribution_window => '7d_click',
    p_fetched_at => '2026-08-15T06:00:00Z', p_first_seen_at => '2026-08-15T06:00:00Z',
    p_restates_until => '2026-09-11T06:00:00Z', p_conversions => p_before);
  perform app.upsert_envelope_row(
    p_workspace_id => p_workspace, p_connection_id => null, p_source => 'meta_ads',
    p_account_id => 'act_1', p_entity_id => p_entity, p_entity_type => 'ad_group',
    p_native_entity_type => 'adset', p_native_id => '1',
    p_date => '2026-08-14', p_currency => 'EUR', p_timezone => 'Europe/Berlin',
    p_attribution_window => '7d_click',
    p_fetched_at => '2026-08-16T06:00:00Z', p_first_seen_at => '2026-08-16T06:00:00Z',
    p_restates_until => '2026-09-11T06:00:00Z', p_conversions => p_after);
end;
$$;

begin;
  set local role app_ingest;
  select app_test.make_event('6c000000-0000-0000-0000-000000000001', 'ag_1', 41, 47);
  select app_test.make_event('6c000000-0000-0000-0000-000000000002', 'ag_2', 10, 12);
  reset role;
commit;

-- NORMALISE THE QUEUE CLOCK. `next_attempt_at` defaults to `now()`, so a freshly produced event is
-- due at the moment the suite runs -- and every assertion below uses a fixed timestamp, which would
-- otherwise be in the past relative to it. Anchoring the queue to a known instant is what lets the
-- backoff be asserted to the minute instead of approximately.
update public.restatement_events
   set occurred_at = '2026-09-08T11:00:00Z', next_attempt_at = '2026-09-08T11:00:00Z';

-- The two event ids, captured as OWNER. `app_webhook` has no grant on the table -- it receives ids
-- from `app.due_restatement_events` and never looks one up -- so a suite that queried the table
-- while wearing that role would be asserting against a privilege the role must not have.
select id as ev_one from public.restatement_events
 where workspace_id = '6c000000-0000-0000-0000-000000000001' \gset
select id as ev_two from public.restatement_events
 where workspace_id = '6c000000-0000-0000-0000-000000000002' \gset

-- ---------------------------------------------------------------------------------------------
-- NO ENDPOINT, NO DELIVERY
-- ---------------------------------------------------------------------------------------------

begin;
  set local role app_webhook;
  select app_test.check('an event with no endpoint is not due',
    (select count(*) = 0 from app.due_restatement_events('w1', 50)));
  reset role;
commit;

insert into public.webhook_endpoints (id, workspace_id, url) values
  ('6e000000-0000-0000-0000-000000000001', '6c000000-0000-0000-0000-000000000001', 'https://hooks.example.test/one'),
  ('6e000000-0000-0000-0000-000000000002', '6c000000-0000-0000-0000-000000000002', 'https://hooks.example.test/two');

begin;
  -- A second active endpoint would be delivered to twice and recorded once, because the outbox
  -- carries one delivery state per event. Refused until a per-(event, endpoint) row exists.
  select app_test.check_rejected('a second active endpoint for one workspace is refused',
    $sql$insert into public.webhook_endpoints (workspace_id, url)
      values ('6c000000-0000-0000-0000-000000000001', 'https://hooks.example.test/second')$sql$);
commit;

-- ---------------------------------------------------------------------------------------------
-- CLAIMING
-- ---------------------------------------------------------------------------------------------

begin;
  set local role app_webhook;
  create temporary table claimed_once as
    select * from app.due_restatement_events('worker-a', 50, '2026-09-08T12:00:00Z');

  select app_test.check('every workspace with an active endpoint has its event claimed',
    (select count(*) = 2 from claimed_once));

  select app_test.check('the claim carries the endpoint to send to',
    (select endpoint_url = 'https://hooks.example.test/one' and secret_version = 1
       from claimed_once where workspace_id = '6c000000-0000-0000-0000-000000000001'));

  -- The payload is built in SQL and validated in TypeScript. These assertions are the SQL half:
  -- the keys the contract requires are present and carry what the row said.
  select app_test.check('the payload is the contract''s shape',
    (select payload ? 'type' and payload ? 'revised_from' and payload ? 'metrics'
              and payload ? 'entity' and payload ? 'dimensions' and payload ? 'is_provisional'
       from claimed_once where workspace_id = '6c000000-0000-0000-0000-000000000001'));

  select app_test.check('and the diff a receiver came for',
    (select (payload -> 'revised_from' ->> 'conversions')::numeric = 41
        and (payload -> 'metrics' ->> 'conversions')::numeric = 47
       from claimed_once where workspace_id = '6c000000-0000-0000-0000-000000000001'));

  -- Two workers must not both deliver the same event. The lease is what stops it.
  select app_test.check('a second claim in the same instant gets nothing',
    (select count(*) = 0 from app.due_restatement_events('worker-b', 50, '2026-09-08T12:00:00Z')));

  -- A worker that dies mid-delivery cannot release its own claim, so the lease has to expire.
  select app_test.check('an abandoned claim is reclaimable once its lease expires',
    (select count(*) = 2 from app.due_restatement_events('worker-b', 50, '2026-09-08T12:05:00Z')));
  reset role;
commit;

-- ---------------------------------------------------------------------------------------------
-- SUCCESS IS TERMINAL
-- ---------------------------------------------------------------------------------------------

begin;
  set local role app_webhook;
  select app_test.check('recording a success reports that it landed',
    (select app.record_delivery(:'ev_one'::uuid, true, 200, null, '2026-09-08T12:06:00Z')));
  reset role;

  select app_test.check('the event is marked delivered and its claim released',
    (select delivered_at = '2026-09-08T12:06:00Z' and claimed_at is null and attempts = 1
       from public.restatement_events where workspace_id = '6c000000-0000-0000-0000-000000000001'));

  set local role app_webhook;
  select app_test.check('and is never claimed again',
    (select count(*) = 0 from app.due_restatement_events('worker-c', 50, '2026-09-08T13:00:00Z')
      where workspace_id = '6c000000-0000-0000-0000-000000000001'));
  reset role;
commit;

-- ---------------------------------------------------------------------------------------------
-- FAILURE IS RETRIED, ON A SCHEDULE, AND THEN IT STOPS
-- ---------------------------------------------------------------------------------------------

begin;
  set local role app_webhook;
  select app.record_delivery(:'ev_two'::uuid, false, 503, 'endpoint returned 503', '2026-09-08T12:06:00Z');
  reset role;

  select app_test.check('a failure counts an attempt and keeps the reason',
    (select attempts = 1 and last_error like '503%' and delivered_at is null and failed_at is null
       from public.restatement_events where workspace_id = '6c000000-0000-0000-0000-000000000002'));

  -- One minute after the first failure, per app.delivery_backoff.
  select app_test.check('and schedules the next attempt rather than retrying immediately',
    (select next_attempt_at = '2026-09-08T12:07:00Z'
       from public.restatement_events where workspace_id = '6c000000-0000-0000-0000-000000000002'));

  set local role app_webhook;
  select app_test.check('a failed event is not due before its backoff has passed',
    (select count(*) = 0 from app.due_restatement_events('worker-d', 50, '2026-09-08T12:06:30Z')));

  select app_test.check('and is due once it has',
    (select count(*) = 1 from app.due_restatement_events('worker-d', 50, '2026-09-08T12:07:30Z')));
  reset role;
commit;

begin;
  -- Burn the remaining attempts. An event that retries forever is an endpoint nobody notices is
  -- broken, so the schedule has an end.
  set local role app_webhook;
  select app.record_delivery(:'ev_two'::uuid, false, 503, 'still down', '2026-09-08T13:00:00Z');
  select app.record_delivery(:'ev_two'::uuid, false, 503, 'still down', '2026-09-08T14:00:00Z');
  select app.record_delivery(:'ev_two'::uuid, false, 503, 'still down', '2026-09-08T15:00:00Z');
  select app.record_delivery(:'ev_two'::uuid, false, 503, 'still down', '2026-09-08T16:00:00Z');
  reset role;

  select app_test.check('five failures are still retrying',
    (select attempts = 5 and failed_at is null
       from public.restatement_events where workspace_id = '6c000000-0000-0000-0000-000000000002'));

  set local role app_webhook;
  select app.record_delivery(:'ev_two'::uuid, false, 503, 'still down', '2026-09-08T17:00:00Z');
  reset role;

  select app_test.check('the sixth gives up and says when',
    (select attempts = 6 and failed_at = '2026-09-08T17:00:00Z'
       from public.restatement_events where workspace_id = '6c000000-0000-0000-0000-000000000002'));

  set local role app_webhook;
  select app_test.check('a dead-lettered event is never claimed again',
    (select count(*) = 0 from app.due_restatement_events('worker-e', 50, '2026-09-10T00:00:00Z')));
  reset role;

  select app_test.check('recording an outcome twice is refused, not applied',
    (select not app.record_delivery(:'ev_two'::uuid, true, 200, null, '2026-09-10T00:00:00Z')));
commit;

-- ---------------------------------------------------------------------------------------------
-- AN INACTIVE ENDPOINT STOPS DELIVERY
-- ---------------------------------------------------------------------------------------------

begin;
  set local role app_ingest;
  select app_test.make_event('6c000000-0000-0000-0000-000000000001', 'ag_3', 5, 9);
  reset role;
  -- Due, so that the assertion below is about the endpoint being disabled and not about the clock.
  update public.restatement_events set next_attempt_at = '2026-09-09T00:00:00Z'
   where entity_id = 'ag_3';

  update public.webhook_endpoints
     set active = false, disabled_at = now(), disabled_reason = 'customer turned it off'
   where id = '6e000000-0000-0000-0000-000000000001';

  set local role app_webhook;
  select app_test.check('an event for a disabled endpoint is not due',
    (select count(*) = 0 from app.due_restatement_events('worker-f', 50, '2026-09-10T00:00:00Z')));
  reset role;
commit;

-- ---------------------------------------------------------------------------------------------
-- WHO MAY SEE AND CHANGE AN ENDPOINT
-- ---------------------------------------------------------------------------------------------

begin;
  select app_test.check_rejected('an http endpoint is refused: a signature proves origin, not secrecy',
    $sql$insert into public.webhook_endpoints (workspace_id, url)
      values ('6c000000-0000-0000-0000-000000000001', 'http://hooks.example.test/plain')$sql$);
commit;

begin;
  set local role authenticated;
  select set_config('request.jwt.claim.sub', '61111111-1111-1111-1111-111111111111', true);

  select app_test.check('a member sees where its own workspace delivers',
    (select count(*) = 1 from public.webhook_endpoints
      where workspace_id = '6c000000-0000-0000-0000-000000000001'));

  select app_test.check('and not another tenant''s',
    (select count(*) = 0 from public.webhook_endpoints
      where workspace_id = '6c000000-0000-0000-0000-000000000002'));

  -- Creating an endpoint mints a secret. That is an account-management action, not a row a tenant
  -- writes -- and a tenant who could write here could point another workspace's deliveries at
  -- itself if the policy were ever loosened by one clause.
  select app_test.check_denied('a member cannot create an endpoint directly',
    $sql$insert into public.webhook_endpoints (workspace_id, url)
      values ('6c000000-0000-0000-0000-000000000001', 'https://attacker.example.test/x')$sql$);

  select app_test.check_denied('nor repoint an existing one',
    $sql$update public.webhook_endpoints set url = 'https://attacker.example.test/x'
      where workspace_id = '6c000000-0000-0000-0000-000000000001'$sql$);
  reset role;
commit;

begin;
  select app_test.check('the delivery role holds no table grants at all',
    (select not has_table_privilege('app_webhook', 'public.restatement_events', 'select')
        and not has_table_privilege('app_webhook', 'public.restatement_events', 'update')
        and not has_table_privilege('app_webhook', 'public.webhook_endpoints', 'select')));

  select app_test.check('its whole vocabulary is the two functions',
    (select has_function_privilege('app_webhook', 'app.due_restatement_events(text, integer, timestamptz)', 'execute')
        and has_function_privilege('app_webhook', 'app.record_delivery(uuid, boolean, integer, text, timestamptz)', 'execute')));

  select app_test.check('and a tenant may not call either of them',
    (select not has_function_privilege('authenticated', 'app.due_restatement_events(text, integer, timestamptz)', 'execute')
        and not has_function_privilege('authenticated', 'app.record_delivery(uuid, boolean, integer, text, timestamptz)', 'execute')));
commit;

-- ---------------------------------------------------------------------------------------------
-- RETENTION
--
-- State at this point: ev_one delivered at 2026-09-08T12:06Z, ev_two dead-lettered at 17:00Z, and
-- the `ag_3` event never delivered at all.
-- ---------------------------------------------------------------------------------------------

begin;
  set local role app_webhook;
  select app_test.check('nothing is pruned inside the window',
    (select app.prune_restatement_events(5000, '2026-09-20T00:00:00Z') = 0));

  select app_test.check('a limit of zero prunes nothing, however overdue',
    (select app.prune_restatement_events(0, '2027-06-01T00:00:00Z') = 0));

  -- Past the 30-day delivered window, inside the 90-day failed one.
  select app_test.check('a delivered event past its window is pruned',
    (select app.prune_restatement_events(5000, '2026-10-15T00:00:00Z') = 1));
  reset role;

  select app_test.check('and it is the delivered one that went',
    (select count(*) = 0 from public.restatement_events where id = :'ev_one'::uuid));

  select app_test.check('a dead-lettered event is kept three times as long',
    (select count(*) = 1 from public.restatement_events where id = :'ev_two'::uuid));

  -- THE LOAD-BEARING ONE. An event still in the queue after nine months is not garbage, it is a
  -- bug -- a workspace with no endpoint, a worker that stopped, a lease nobody released. Pruning it
  -- would erase the evidence and the customer's alert in one statement, and leave a healthy-looking
  -- table behind.
  set local role app_webhook;
  select app_test.check('an undelivered event is never pruned, at any age',
    (select app.prune_restatement_events(5000, '2027-06-01T00:00:00Z') = 1));
  reset role;

  select app_test.check('the undelivered event is still there',
    (select count(*) = 1 from public.restatement_events where entity_id = 'ag_3'));

  select app_test.check('and the dead-lettered one is gone once its own window passed',
    (select count(*) = 0 from public.restatement_events where id = :'ev_two'::uuid));
commit;

begin;
  set local role authenticated;
  select set_config('request.jwt.claim.sub', '61111111-1111-1111-1111-111111111111', true);
  select app_test.check('a tenant cannot prune',
    (select not has_function_privilege('authenticated',
      'app.prune_restatement_events(integer, timestamptz)', 'execute')));
  reset role;
commit;

begin;
  delete from public.workspaces where id = '6c000000-0000-0000-0000-000000000002';
  select app_test.check('deleting a workspace takes its endpoints with it',
    (select count(*) = 0 from public.webhook_endpoints
      where workspace_id = '6c000000-0000-0000-0000-000000000002'));
commit;

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
  if v_failed > 0 then raise exception 'webhook delivery: % assertion(s) failed', v_failed; end if;
  if v_total < 38 then
    raise exception 'webhook delivery: only % assertion(s) ran; expected at least 38', v_total;
  end if;
end $$;
