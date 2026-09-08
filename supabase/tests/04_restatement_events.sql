-- Restatement outbox tests.
--
-- The feature is "a webhook when a platform restates". The hard part is not the webhook, it is the
-- SILENCE: the tiered ladder re-pulls every row in the window every night, almost none of those
-- re-pulls change anything, and a webhook that fires on each of them is worse than no webhook.
--
-- So the first two assertions below are the ones that matter, and everything else supports them.

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
  when check_violation or not_null_violation or invalid_text_representation then
    perform app_test.check(p_name, true, 'refused: ' || sqlerrm);
  when others then
    perform app_test.check(p_name, false, 'wrong error: ' || sqlerrm);
end;
$$;

grant usage on schema app_test to authenticated, anon, app_scheduler, app_ingest;
grant all on app_test.results to authenticated, anon, app_scheduler, app_ingest;
grant usage, select on all sequences in schema app_test to authenticated, anon, app_scheduler, app_ingest;
grant execute on all functions in schema app_test to authenticated, anon, app_scheduler, app_ingest;

-- Fixture: two tenants, ids distinct from every other suite in this directory.
insert into auth.users (id, email) values
  ('81111111-1111-1111-1111-111111111111', 'restate-alice@northwind.test'),
  ('83333333-3333-3333-3333-333333333333', 'restate-carol@contoso.test')
on conflict do nothing;

insert into public.organisations (id, name, slug) values
  ('8aaaaaaa-0000-0000-0000-000000000001', 'Northwind Agency', 'northwind-restate'),
  ('8bbbbbbb-0000-0000-0000-000000000002', 'Contoso Brand', 'contoso-restate');

insert into public.workspaces (id, organisation_id, name, slug) values
  ('8c000000-0000-0000-0000-000000000001', '8aaaaaaa-0000-0000-0000-000000000001', 'Client One', 'client-one-restate'),
  ('8c000000-0000-0000-0000-000000000002', '8bbbbbbb-0000-0000-0000-000000000002', 'Contoso', 'contoso-restate');

insert into public.members (id, organisation_id, user_id, role) values
  ('8d000000-0000-0000-0000-000000000001', '8aaaaaaa-0000-0000-0000-000000000001', '81111111-1111-1111-1111-111111111111', 'owner'),
  ('8d000000-0000-0000-0000-000000000002', '8bbbbbbb-0000-0000-0000-000000000002', '83333333-3333-3333-3333-333333333333', 'owner');

-- ---------------------------------------------------------------------------------------------
-- THE FIRST SIGHTING IS NOT A RESTATEMENT
-- ---------------------------------------------------------------------------------------------

begin;
  set local role app_ingest;
  select app.upsert_envelope_row(
    p_workspace_id       => '8c000000-0000-0000-0000-000000000001',
    p_connection_id      => null,
    p_source             => 'meta_ads',
    p_account_id         => 'act_123',
    p_entity_id          => 'ag_1',
    p_entity_type        => 'ad_group',
    p_native_entity_type => 'adset',
    p_native_id          => '238512345',
    p_date               => '2026-08-14',
    p_currency           => 'EUR',
    p_timezone           => 'Europe/Berlin',
    p_attribution_window => '7d_click',
    p_fetched_at         => '2026-08-15T06:00:00Z',
    p_first_seen_at      => '2026-08-15T06:00:00Z',
    p_restates_until     => '2026-09-11T06:00:00Z',
    p_spend              => 1240.55,
    p_conversions        => 41
  );
  reset role;

  select app_test.check('a first sighting writes no event',
    (select count(*) = 0 from public.restatement_events
      where workspace_id = '8c000000-0000-0000-0000-000000000001'));
commit;

-- ---------------------------------------------------------------------------------------------
-- THE PROPERTY THE WHOLE FEATURE TURNS ON: a re-pull that changed nothing is silent
-- ---------------------------------------------------------------------------------------------

begin;
  set local role app_ingest;
  -- The nightly re-pull. A NEW fetched_at, identical numbers -- which is what almost every re-pull
  -- in the ladder looks like. `updated_at` moves, `fetched_at` moves, and nothing was restated.
  select app.upsert_envelope_row(
    p_workspace_id       => '8c000000-0000-0000-0000-000000000001',
    p_connection_id      => null,
    p_source             => 'meta_ads',
    p_account_id         => 'act_123',
    p_entity_id          => 'ag_1',
    p_entity_type        => 'ad_group',
    p_native_entity_type => 'adset',
    p_native_id          => '238512345',
    p_date               => '2026-08-14',
    p_currency           => 'EUR',
    p_timezone           => 'Europe/Berlin',
    p_attribution_window => '7d_click',
    p_fetched_at         => '2026-08-16T06:00:00Z',
    p_first_seen_at      => '2026-08-16T06:00:00Z',
    p_restates_until     => '2026-09-11T06:00:00Z',
    p_spend              => 1240.55,
    p_conversions        => 41
  );
  reset role;

  select app_test.check('a re-pull that changed nothing writes no event',
    (select count(*) = 0 from public.restatement_events
      where workspace_id = '8c000000-0000-0000-0000-000000000001'));

  select app_test.check('and the row was still updated, so the trigger really did fire and decline',
    (select fetched_at = '2026-08-16T06:00:00Z' from public.envelope_rows
      where workspace_id = '8c000000-0000-0000-0000-000000000001' and entity_id = 'ag_1'));

  -- The same number written with a different SCALE is the same number. numeric equality is by
  -- value, not by text, and `is distinct from` inherits that -- so 41 and 41.000000 do not restate.
  set local role app_ingest;
  select app.upsert_envelope_row(
    p_workspace_id       => '8c000000-0000-0000-0000-000000000001',
    p_connection_id      => null,
    p_source             => 'meta_ads',
    p_account_id         => 'act_123',
    p_entity_id          => 'ag_1',
    p_entity_type        => 'ad_group',
    p_native_entity_type => 'adset',
    p_native_id          => '238512345',
    p_date               => '2026-08-14',
    p_currency           => 'EUR',
    p_timezone           => 'Europe/Berlin',
    p_attribution_window => '7d_click',
    p_fetched_at         => '2026-08-17T06:00:00Z',
    p_first_seen_at      => '2026-08-17T06:00:00Z',
    p_restates_until     => '2026-09-11T06:00:00Z',
    p_spend              => 1240.550000,
    p_conversions        => 41.000000
  );
  reset role;

  select app_test.check('the same number at a different scale does not restate',
    (select count(*) = 0 from public.restatement_events
      where workspace_id = '8c000000-0000-0000-0000-000000000001'));
commit;

-- ---------------------------------------------------------------------------------------------
-- A REAL RESTATEMENT: Meta credits late conversions into a closed window
-- ---------------------------------------------------------------------------------------------

begin;
  set local role app_ingest;
  select app.upsert_envelope_row(
    p_workspace_id       => '8c000000-0000-0000-0000-000000000001',
    p_connection_id      => null,
    p_source             => 'meta_ads',
    p_account_id         => 'act_123',
    p_entity_id          => 'ag_1',
    p_entity_type        => 'ad_group',
    p_native_entity_type => 'adset',
    p_native_id          => '238512345',
    p_date               => '2026-08-14',
    p_currency           => 'EUR',
    p_timezone           => 'Europe/Berlin',
    p_attribution_window => '7d_click',
    p_fetched_at         => '2026-08-18T06:00:00Z',
    p_first_seen_at      => '2026-08-18T06:00:00Z',
    p_restates_until     => '2026-09-11T06:00:00Z',
    -- Spend did not move. Conversions did.
    p_spend              => 1240.55,
    p_conversions        => 47
  );
  reset role;

  select app_test.check('a changed metric writes exactly one event',
    (select count(*) = 1 from public.restatement_events
      where workspace_id = '8c000000-0000-0000-0000-000000000001'));

  select app_test.check('the event carries the BEFORE value',
    (select (revised_from ->> 'conversions')::numeric = 41 from public.restatement_events
      where workspace_id = '8c000000-0000-0000-0000-000000000001'));

  select app_test.check('and the AFTER value',
    (select (metrics ->> 'conversions')::numeric = 47 from public.restatement_events
      where workspace_id = '8c000000-0000-0000-0000-000000000001'));

  -- Naming an unchanged metric under a heading that says "revised from" would state that it moved.
  select app_test.check('revised_from names ONLY what moved',
    (select revised_from ? 'conversions' and not (revised_from ? 'spend')
       from public.restatement_events
      where workspace_id = '8c000000-0000-0000-0000-000000000001'));

  select app_test.check('metrics carries the full current set, moved or not',
    (select metrics ? 'conversions' and metrics ? 'spend' from public.restatement_events
      where workspace_id = '8c000000-0000-0000-0000-000000000001'));

  -- A consumer reading `impressions: null` would reasonably conclude the platform reported zero.
  select app_test.check('an absent metric is absent, not null',
    (select not (metrics ? 'impressions') from public.restatement_events
      where workspace_id = '8c000000-0000-0000-0000-000000000001'));

  select app_test.check('the event carries the clocks that say whether the window was open',
    (select restates_until = '2026-09-11T06:00:00Z' and is_provisional
       from public.restatement_events
      where workspace_id = '8c000000-0000-0000-0000-000000000001'));

  select app_test.check('and the row identity needed to fetch the row back',
    (select source = 'meta_ads' and account_id = 'act_123' and entity_id = 'ag_1'
              and date = '2026-08-14' and attribution_window = '7d_click'
       from public.restatement_events
      where workspace_id = '8c000000-0000-0000-0000-000000000001'));
commit;

-- ---------------------------------------------------------------------------------------------
-- A METRIC REVISED TO ABSENT is still a restatement
-- ---------------------------------------------------------------------------------------------

begin;
  set local role app_ingest;
  -- The platform stops reporting conversions for this row entirely. The number a customer saw
  -- yesterday is gone, which is exactly the kind of change nobody notices without an alert.
  select app.upsert_envelope_row(
    p_workspace_id       => '8c000000-0000-0000-0000-000000000001',
    p_connection_id      => null,
    p_source             => 'meta_ads',
    p_account_id         => 'act_123',
    p_entity_id          => 'ag_1',
    p_entity_type        => 'ad_group',
    p_native_entity_type => 'adset',
    p_native_id          => '238512345',
    p_date               => '2026-08-14',
    p_currency           => 'EUR',
    p_timezone           => 'Europe/Berlin',
    p_attribution_window => '7d_click',
    p_fetched_at         => '2026-08-19T06:00:00Z',
    p_first_seen_at      => '2026-08-19T06:00:00Z',
    p_restates_until     => '2026-09-11T06:00:00Z',
    p_spend              => 1240.55
  );
  reset role;

  select app_test.check('a metric revised to absent is recorded',
    (select count(*) = 1 from public.restatement_events
      where workspace_id = '8c000000-0000-0000-0000-000000000001'
        and revised_from ? 'conversions'
        and not (metrics ? 'conversions')
        and fetched_at = '2026-08-19T06:00:00Z'));
commit;

-- ---------------------------------------------------------------------------------------------
-- WHO MAY SEE AN EVENT, AND WHO MAY WRITE ONE
-- ---------------------------------------------------------------------------------------------

begin;
  set local role app_ingest;
  select app.upsert_envelope_row(
    p_workspace_id       => '8c000000-0000-0000-0000-000000000002',
    p_connection_id      => null, p_source => 'ga4',
    p_account_id => 'properties/999', p_entity_id => 'properties/999',
    p_entity_type => 'property', p_native_entity_type => 'property', p_native_id => 'properties/999',
    p_date => '2026-08-20', p_currency => 'EUR', p_timezone => 'Europe/Berlin',
    p_attribution_window => 'model',
    p_fetched_at => '2026-08-21T06:00:00Z', p_first_seen_at => '2026-08-21T06:00:00Z',
    p_sessions => 100);
  select app.upsert_envelope_row(
    p_workspace_id       => '8c000000-0000-0000-0000-000000000002',
    p_connection_id      => null, p_source => 'ga4',
    p_account_id => 'properties/999', p_entity_id => 'properties/999',
    p_entity_type => 'property', p_native_entity_type => 'property', p_native_id => 'properties/999',
    p_date => '2026-08-20', p_currency => 'EUR', p_timezone => 'Europe/Berlin',
    p_attribution_window => 'model',
    p_fetched_at => '2026-08-22T06:00:00Z', p_first_seen_at => '2026-08-22T06:00:00Z',
    p_sessions => 137);
  reset role;

  select app_test.check('the ingest role has no grant on the outbox at all',
    (select not has_table_privilege('app_ingest', 'public.restatement_events', 'select')
        and not has_table_privilege('app_ingest', 'public.restatement_events', 'insert')));

  select app_test.check('yet its write produced an event, because the TRIGGER is the privilege',
    (select count(*) = 1 from public.restatement_events
      where workspace_id = '8c000000-0000-0000-0000-000000000002'));
commit;

begin;
  set local role authenticated;
  select set_config('request.jwt.claim.sub', '81111111-1111-1111-1111-111111111111', true);

  select app_test.check('a member reads its own workspace events',
    (select count(*) > 0 from public.restatement_events
      where workspace_id = '8c000000-0000-0000-0000-000000000001'));

  select app_test.check('and cannot see another tenant''s',
    (select count(*) = 0 from public.restatement_events
      where workspace_id = '8c000000-0000-0000-0000-000000000002'));

  -- An event a customer could forge is an alert nobody can trust.
  select app_test.check_denied('a tenant cannot forge an event',
    $sql$insert into public.restatement_events (
      workspace_id, source, account_id, entity_id, entity_type, date, currency,
      revised_from, metrics, fetched_at, first_seen_at, is_provisional
    ) values (
      '8c000000-0000-0000-0000-000000000001', 'meta_ads', 'act_123', 'ag_1', 'ad_group',
      '2026-08-14', 'EUR', '{"conversions": 1}', '{"conversions": 9999}', now(), now(), true
    )$sql$);

  select app_test.check_denied('nor delete one that embarrasses it',
    $sql$delete from public.restatement_events
      where workspace_id = '8c000000-0000-0000-0000-000000000001'$sql$);
  reset role;
commit;

-- ---------------------------------------------------------------------------------------------
-- THE EMPTY DIFF, AND ERASURE
-- ---------------------------------------------------------------------------------------------

begin;
  select app_test.check_rejected('an event with an empty diff is refused by the database',
    $sql$insert into public.restatement_events (
      workspace_id, source, account_id, entity_id, entity_type, date, currency,
      revised_from, metrics, fetched_at, first_seen_at, is_provisional
    ) values (
      '8c000000-0000-0000-0000-000000000001', 'meta_ads', 'act_123', 'ag_x', 'ad_group',
      '2026-08-14', 'EUR', '{}', '{"conversions": 9}', now(), now(), true
    )$sql$);
commit;

begin;
  delete from public.workspaces where id = '8c000000-0000-0000-0000-000000000002';
  select app_test.check('deleting a workspace takes its events with it',
    (select count(*) = 0 from public.restatement_events
      where workspace_id = '8c000000-0000-0000-0000-000000000002'));
commit;

\o

select name, 'FAIL' as result, detail from app_test.results where not passed order by id;
select count(*) filter (where passed) as passed,
       count(*) filter (where not passed) as failed,
       count(*) as total
from app_test.results;

do $$
declare v_failed integer;
begin
  select count(*) into v_failed from app_test.results where not passed;
  if v_failed > 0 then raise exception 'restatement events: % assertion(s) failed', v_failed; end if;
end $$;
