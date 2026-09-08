-- Envelope store tests.
--
-- The header of 20260908001100_envelope_rows.sql names four decisions. Each one is a place where the
-- table would work perfectly in testing and be wrong in production, so each is asserted here rather
-- than trusted to the comment beside it.

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

-- RLS denies INSERT by raising and denies UPDATE/DELETE by filtering to zero rows with no error.
-- A harness that only caught exceptions would call the second one a pass.
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

-- A constraint violation is a PASS: the point of these is that the database refuses.
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

-- Fixture: two tenants, distinct ids from every other suite in this directory.
insert into auth.users (id, email) values
  ('71111111-1111-1111-1111-111111111111', 'store-alice@northwind.test'),
  ('73333333-3333-3333-3333-333333333333', 'store-carol@contoso.test')
on conflict do nothing;

insert into public.organisations (id, name, slug) values
  ('7aaaaaaa-0000-0000-0000-000000000001', 'Northwind Agency', 'northwind-store'),
  ('7bbbbbbb-0000-0000-0000-000000000002', 'Contoso Brand', 'contoso-store');

insert into public.workspaces (id, organisation_id, name, slug) values
  ('7c000000-0000-0000-0000-000000000001', '7aaaaaaa-0000-0000-0000-000000000001', 'Client One', 'client-one-store'),
  ('7c000000-0000-0000-0000-000000000003', '7bbbbbbb-0000-0000-0000-000000000002', 'Contoso', 'contoso-store');

insert into public.members (id, organisation_id, user_id, role) values
  ('7d000000-0000-0000-0000-000000000001', '7aaaaaaa-0000-0000-0000-000000000001', '71111111-1111-1111-1111-111111111111', 'owner'),
  ('7d000000-0000-0000-0000-000000000003', '7bbbbbbb-0000-0000-0000-000000000002', '73333333-3333-3333-3333-333333333333', 'owner');

insert into public.connections
  (id, workspace_id, provider, external_account_id, credential_ciphertext, credential_iv, wrapped_dek)
values
  ('7e000000-0000-0000-0000-000000000001', '7c000000-0000-0000-0000-000000000001', 'ga4', 'properties/123456', '\x01', '\x02', '\x03');

-- ---------------------------------------------------------------------------------------------
-- THE PROMISE. first_seen_at is written once and survives every re-pull.
-- ---------------------------------------------------------------------------------------------
-- NOTE ON ROLES IN THIS SUITE. Every write runs as `app_ingest` and every read-back runs as the
-- owner, because the ingest role deliberately has NO grant on the table -- it reaches it only
-- through the SECURITY DEFINER function. That absence is asserted in its own section below; here it
-- just means the suite has to switch roles around each assertion, which is the design showing
-- through rather than an inconvenience.
begin;
  set local role app_ingest;

  -- First sight, on 2026-08-14. GA4's window is 12 days, so this closes on 2026-08-26.
  select app.upsert_envelope_row(
    p_workspace_id       => '7c000000-0000-0000-0000-000000000001',
    p_connection_id      => '7e000000-0000-0000-0000-000000000001',
    p_source             => 'ga4',
    p_account_id         => 'properties/123456',
    p_entity_id          => 'properties/123456',
    p_entity_type        => 'property',
    p_native_entity_type => 'property',
    p_native_id          => 'properties/123456',
    p_date               => '2026-08-14',
    p_currency           => 'EUR',
    p_timezone           => 'Europe/Berlin',
    p_attribution_window => 'model',
    p_fetched_at         => '2026-08-14T06:00:00Z',
    p_first_seen_at      => '2026-08-14T06:00:00Z',
    p_restates_until     => '2026-08-26T06:00:00Z',
    p_sessions           => 1284,
    p_conversions        => 37
  );
  reset role;

  select app_test.check('a first sighting is provisional',
    (select is_provisional from public.envelope_rows
      where workspace_id = '7c000000-0000-0000-0000-000000000001'
        and entity_id = 'properties/123456' and date = '2026-08-14'));

  -- A re-pull the next day, with the connector doing what a connector must: passing its own
  -- fetched_at as first_seen_at, because it has no store and cannot know the row exists.
  set local role app_ingest;
  select app.upsert_envelope_row(
    p_workspace_id       => '7c000000-0000-0000-0000-000000000001',
    p_connection_id      => '7e000000-0000-0000-0000-000000000001',
    p_source             => 'ga4',
    p_account_id         => 'properties/123456',
    p_entity_id          => 'properties/123456',
    p_entity_type        => 'property',
    p_native_entity_type => 'property',
    p_native_id          => 'properties/123456',
    p_date               => '2026-08-14',
    p_currency           => 'EUR',
    p_timezone           => 'Europe/Berlin',
    p_attribution_window => 'model',
    p_fetched_at         => '2026-08-15T06:00:00Z',
    p_first_seen_at      => '2026-08-15T06:00:00Z',
    p_restates_until     => '2026-08-27T06:00:00Z',
    p_sessions           => 1290,
    p_conversions        => 41
  );
  reset role;

  select app_test.check('first_seen_at survives a re-pull',
    (select first_seen_at = '2026-08-14T06:00:00Z' from public.envelope_rows
      where workspace_id = '7c000000-0000-0000-0000-000000000001'
        and entity_id = 'properties/123456' and date = '2026-08-14'));

  -- THE DEFECT THIS TABLE EXISTS TO PREVENT. If restates_until moved with the re-pull it would be
  -- 2026-08-27, and it would move again every night, and the row would never become final.
  select app_test.check('restates_until does not slide forward on a re-pull',
    (select restates_until = '2026-08-26T06:00:00Z' from public.envelope_rows
      where workspace_id = '7c000000-0000-0000-0000-000000000001'
        and entity_id = 'properties/123456' and date = '2026-08-14'));

  select app_test.check('the restated metrics ARE updated',
    (select sessions = 1290 and conversions = 41 from public.envelope_rows
      where workspace_id = '7c000000-0000-0000-0000-000000000001'
        and entity_id = 'properties/123456' and date = '2026-08-14'));

  select app_test.check('a re-pull inside the window leaves the row provisional',
    (select is_provisional from public.envelope_rows
      where workspace_id = '7c000000-0000-0000-0000-000000000001'
        and entity_id = 'properties/123456' and date = '2026-08-14'));

  -- A pull AFTER the preserved window closes. This assertion is the product's guarantee.
  set local role app_ingest;
  select app.upsert_envelope_row(
    p_workspace_id       => '7c000000-0000-0000-0000-000000000001',
    p_connection_id      => '7e000000-0000-0000-0000-000000000001',
    p_source             => 'ga4',
    p_account_id         => 'properties/123456',
    p_entity_id          => 'properties/123456',
    p_entity_type        => 'property',
    p_native_entity_type => 'property',
    p_native_id          => 'properties/123456',
    p_date               => '2026-08-14',
    p_currency           => 'EUR',
    p_timezone           => 'Europe/Berlin',
    p_attribution_window => 'model',
    p_fetched_at         => '2026-09-08T06:00:00Z',
    p_first_seen_at      => '2026-09-08T06:00:00Z',
    p_restates_until     => '2026-09-20T06:00:00Z',
    p_sessions           => 1290,
    p_conversions        => 41
  );
  reset role;

  select app_test.check('is_provisional CLEARS once the preserved window closes',
    (select not is_provisional from public.envelope_rows
      where workspace_id = '7c000000-0000-0000-0000-000000000001'
        and entity_id = 'properties/123456' and date = '2026-08-14'));

  select app_test.check('three pulls of one day produced exactly one row',
    (select count(*) = 1 from public.envelope_rows
      where workspace_id = '7c000000-0000-0000-0000-000000000001'
        and entity_id = 'properties/123456' and date = '2026-08-14'));
commit;

-- ---------------------------------------------------------------------------------------------
-- The upsert key, including the null that a plain UNIQUE would let through.
-- ---------------------------------------------------------------------------------------------
begin;
  set local role app_ingest;

  -- An impressions-only row legitimately has NO attribution window. Under PostgreSQL's default
  -- unique semantics two NULLs are different values, so a plain UNIQUE would insert a second copy
  -- here -- invisible until somebody sums the column.
  select app.upsert_envelope_row(
    p_workspace_id       => '7c000000-0000-0000-0000-000000000001',
    p_connection_id      => null,
    p_source             => 'meta_ads',
    p_account_id         => 'act_1',
    p_entity_id          => 'camp_1',
    p_entity_type        => 'campaign',
    p_native_entity_type => 'campaign',
    p_native_id          => 'camp_1',
    p_date               => '2026-08-14',
    p_currency           => 'EUR',
    p_timezone           => 'Europe/Berlin',
    p_attribution_window => null,
    p_fetched_at         => '2026-08-15T06:00:00Z',
    p_first_seen_at      => '2026-08-15T06:00:00Z',
    p_impressions        => 1000
  );
  select app.upsert_envelope_row(
    p_workspace_id       => '7c000000-0000-0000-0000-000000000001',
    p_connection_id      => null,
    p_source             => 'meta_ads',
    p_account_id         => 'act_1',
    p_entity_id          => 'camp_1',
    p_entity_type        => 'campaign',
    p_native_entity_type => 'campaign',
    p_native_id          => 'camp_1',
    p_date               => '2026-08-14',
    p_currency           => 'EUR',
    p_timezone           => 'Europe/Berlin',
    p_attribution_window => null,
    p_fetched_at         => '2026-08-16T06:00:00Z',
    p_first_seen_at      => '2026-08-16T06:00:00Z',
    p_impressions        => 1100
  );
  reset role;

  select app_test.check('two pulls of a NULL-window row upsert rather than duplicate',
    (select count(*) = 1 from public.envelope_rows
      where account_id = 'act_1' and entity_id = 'camp_1' and date = '2026-08-14'));

  select app_test.check('and the second pull restated the first',
    (select impressions = 1100 from public.envelope_rows
      where account_id = 'act_1' and entity_id = 'camp_1' and date = '2026-08-14'));

  -- Two attribution windows for the same entity-day are two DIFFERENT rows: the window is part of
  -- the key precisely because 7d_click and 28d_click are different numbers, not disagreeing ones.
  set local role app_ingest;
  select app.upsert_envelope_row(
    p_workspace_id       => '7c000000-0000-0000-0000-000000000001',
    p_connection_id      => null, p_source => 'meta_ads',
    p_account_id => 'act_1', p_entity_id => 'camp_2', p_entity_type => 'campaign',
    p_native_entity_type => 'campaign', p_native_id => 'camp_2',
    p_date => '2026-08-14', p_currency => 'EUR', p_timezone => 'Europe/Berlin',
    p_attribution_window => '7d_click',
    p_fetched_at => '2026-08-16T06:00:00Z', p_first_seen_at => '2026-08-16T06:00:00Z',
    p_conversions => 10
  );
  select app.upsert_envelope_row(
    p_workspace_id       => '7c000000-0000-0000-0000-000000000001',
    p_connection_id      => null, p_source => 'meta_ads',
    p_account_id => 'act_1', p_entity_id => 'camp_2', p_entity_type => 'campaign',
    p_native_entity_type => 'campaign', p_native_id => 'camp_2',
    p_date => '2026-08-14', p_currency => 'EUR', p_timezone => 'Europe/Berlin',
    p_attribution_window => '28d_click',
    p_fetched_at => '2026-08-16T06:00:00Z', p_first_seen_at => '2026-08-16T06:00:00Z',
    p_conversions => 14
  );
  reset role;
  select app_test.check('two attribution windows are two rows, not a collision',
    (select count(*) = 2 from public.envelope_rows
      where account_id = 'act_1' and entity_id = 'camp_2' and date = '2026-08-14'));

  -- The same account id in two workspaces is two rows. An agency and its client may each connect
  -- the same platform account, and neither may see the other's copy.
  set local role app_ingest;
  select app.upsert_envelope_row(
    p_workspace_id       => '7c000000-0000-0000-0000-000000000003',
    p_connection_id      => null, p_source => 'meta_ads',
    p_account_id => 'act_1', p_entity_id => 'camp_1', p_entity_type => 'campaign',
    p_native_entity_type => 'campaign', p_native_id => 'camp_1',
    p_date => '2026-08-14', p_currency => 'EUR', p_timezone => 'Europe/Berlin',
    p_attribution_window => null,
    p_fetched_at => '2026-08-16T06:00:00Z', p_first_seen_at => '2026-08-16T06:00:00Z',
    p_impressions => 55
  );
  reset role;
  select app_test.check('the same platform account in two workspaces is two rows',
    (select count(*) = 2 from public.envelope_rows
      where account_id = 'act_1' and entity_id = 'camp_1' and date = '2026-08-14'));
commit;

-- ---------------------------------------------------------------------------------------------
-- What the database refuses. Section 2's refusal, restated where it outlives every code path.
-- ---------------------------------------------------------------------------------------------
begin;
  set local role app_ingest;

  select app_test.check_rejected('an unlabelled conversion count is refused', $q$
    select app.upsert_envelope_row(
      p_workspace_id => '7c000000-0000-0000-0000-000000000001',
      p_connection_id => null, p_source => 'meta_ads',
      p_account_id => 'act_9', p_entity_id => 'camp_9', p_entity_type => 'campaign',
      p_native_entity_type => 'campaign', p_native_id => 'camp_9',
      p_date => '2026-08-14', p_currency => 'EUR', p_timezone => 'Europe/Berlin',
      p_attribution_window => null,
      p_fetched_at => '2026-08-16T06:00:00Z', p_first_seen_at => '2026-08-16T06:00:00Z',
      p_conversions => 12)
  $q$);

  select app_test.check_rejected('an unlabelled conversion VALUE is refused too', $q$
    select app.upsert_envelope_row(
      p_workspace_id => '7c000000-0000-0000-0000-000000000001',
      p_connection_id => null, p_source => 'meta_ads',
      p_account_id => 'act_9', p_entity_id => 'camp_9', p_entity_type => 'campaign',
      p_native_entity_type => 'campaign', p_native_id => 'camp_9',
      p_date => '2026-08-14', p_currency => 'EUR', p_timezone => 'Europe/Berlin',
      p_attribution_window => null,
      p_fetched_at => '2026-08-16T06:00:00Z', p_first_seen_at => '2026-08-16T06:00:00Z',
      p_conversions_value => 12.5)
  $q$);

  -- An IMPRESSIONS-only row with no window is fine: a window on it would be a label with nothing
  -- to label. The refusal must be narrow or it stops legitimate rows.
  select app_test.check_rejected('a converted amount with no rate is refused', $q$
    select app.upsert_envelope_row(
      p_workspace_id => '7c000000-0000-0000-0000-000000000001',
      p_connection_id => null, p_source => 'meta_ads',
      p_account_id => 'act_9', p_entity_id => 'camp_8', p_entity_type => 'campaign',
      p_native_entity_type => 'campaign', p_native_id => 'camp_8',
      p_date => '2026-08-14', p_currency => 'EUR', p_timezone => 'Europe/Berlin',
      p_attribution_window => '7d_click',
      p_fetched_at => '2026-08-16T06:00:00Z', p_first_seen_at => '2026-08-16T06:00:00Z',
      p_conversions_value => 100, p_fx_source => 'ecb', p_fx_rate_date => '2026-08-14',
      p_fx_rate => null)
  $q$);

  select app_test.check_rejected('a JSON payload in the raw KEY column is refused', $q$
    select app.upsert_envelope_row(
      p_workspace_id => '7c000000-0000-0000-0000-000000000001',
      p_connection_id => null, p_source => 'meta_ads',
      p_account_id => 'act_9', p_entity_id => 'camp_7', p_entity_type => 'campaign',
      p_native_entity_type => 'campaign', p_native_id => 'camp_7',
      p_date => '2026-08-14', p_currency => 'EUR', p_timezone => 'Europe/Berlin',
      p_attribution_window => null,
      p_fetched_at => '2026-08-16T06:00:00Z', p_first_seen_at => '2026-08-16T06:00:00Z',
      p_impressions => 1, p_raw_key => '{"rows":[]}')
  $q$);

  select app_test.check_rejected('a lower-case currency is refused', $q$
    select app.upsert_envelope_row(
      p_workspace_id => '7c000000-0000-0000-0000-000000000001',
      p_connection_id => null, p_source => 'meta_ads',
      p_account_id => 'act_9', p_entity_id => 'camp_6', p_entity_type => 'campaign',
      p_native_entity_type => 'campaign', p_native_id => 'camp_6',
      p_date => '2026-08-14', p_currency => 'eur', p_timezone => 'Europe/Berlin',
      p_attribution_window => null,
      p_fetched_at => '2026-08-16T06:00:00Z', p_first_seen_at => '2026-08-16T06:00:00Z',
      p_impressions => 1)
  $q$);

  select app_test.check_rejected('a source that is not in the dictionary is refused', $q$
    select app.upsert_envelope_row(
      p_workspace_id => '7c000000-0000-0000-0000-000000000001',
      p_connection_id => null, p_source => 'tiktok_ads',
      p_account_id => 'act_9', p_entity_id => 'camp_5', p_entity_type => 'campaign',
      p_native_entity_type => 'campaign', p_native_id => 'camp_5',
      p_date => '2026-08-14', p_currency => 'EUR', p_timezone => 'Europe/Berlin',
      p_attribution_window => null,
      p_fetched_at => '2026-08-16T06:00:00Z', p_first_seen_at => '2026-08-16T06:00:00Z',
      p_impressions => 1)
  $q$);

  -- Google Ads reports FRACTIONAL conversions under data-driven attribution. An integer column
  -- would have rejected or truncated this, and truncation is the worse of the two.
  select app.upsert_envelope_row(
    p_workspace_id => '7c000000-0000-0000-0000-000000000001',
    p_connection_id => null, p_source => 'google_ads',
    p_account_id => '123-456', p_entity_id => 'camp_frac', p_entity_type => 'campaign',
    p_native_entity_type => 'campaign', p_native_id => 'camp_frac',
    p_date => '2026-08-14', p_currency => 'EUR', p_timezone => 'Europe/Berlin',
    p_attribution_window => 'model',
    p_fetched_at => '2026-08-16T06:00:00Z', p_first_seen_at => '2026-08-16T06:00:00Z',
    p_conversions => 12.75);
  reset role;
  select app_test.check('a fractional conversion count is stored exactly',
    (select conversions = 12.75 from public.envelope_rows where entity_id = 'camp_frac'));
commit;

-- ---------------------------------------------------------------------------------------------
-- Tenancy. The half that matters.
-- ---------------------------------------------------------------------------------------------
begin;
  set local role app_ingest;
  select app.upsert_envelope_row(
    p_workspace_id => '7c000000-0000-0000-0000-000000000001',
    p_connection_id => null, p_source => 'ga4',
    p_account_id => 'properties/123456', p_entity_id => 'properties/123456',
    p_entity_type => 'property', p_native_entity_type => 'property',
    p_native_id => 'properties/123456',
    p_date => '2026-08-20', p_currency => 'EUR', p_timezone => 'Europe/Berlin',
    p_attribution_window => 'model',
    p_fetched_at => '2026-08-21T06:00:00Z', p_first_seen_at => '2026-08-21T06:00:00Z',
    p_sessions => 500);
  select app.upsert_envelope_row(
    p_workspace_id => '7c000000-0000-0000-0000-000000000003',
    p_connection_id => null, p_source => 'ga4',
    p_account_id => 'properties/999', p_entity_id => 'properties/999',
    p_entity_type => 'property', p_native_entity_type => 'property',
    p_native_id => 'properties/999',
    p_date => '2026-08-20', p_currency => 'EUR', p_timezone => 'Europe/Berlin',
    p_attribution_window => 'model',
    p_fetched_at => '2026-08-21T06:00:00Z', p_first_seen_at => '2026-08-21T06:00:00Z',
    p_sessions => 900);

  reset role;

  set local role authenticated;
  select set_config('request.jwt.claim.sub', '71111111-1111-1111-1111-111111111111', true);

  select app_test.check('an owner reads their own workspace''s rows',
    (select count(*) = 1 from public.envelope_rows
      where workspace_id = '7c000000-0000-0000-0000-000000000001' and date = '2026-08-20'));

  -- The whole tenant-isolation guarantee, on the table that holds the actual data.
  select app_test.check('an owner CANNOT read another organisation''s rows',
    (select count(*) = 0 from public.envelope_rows
      where workspace_id = '7c000000-0000-0000-0000-000000000003'));

  select app_test.check('a cross-tenant sum returns only this tenant''s numbers',
    (select coalesce(sum(sessions), 0) = 500 from public.envelope_rows where date = '2026-08-20'));

  -- DERIVED PLATFORM DATA IS NOT USER INPUT. A tenant who could write here could fabricate the
  -- numbers the product's guarantee rests on.
  select app_test.check_denied('an owner cannot INSERT an envelope row', $q$
    insert into public.envelope_rows
      (workspace_id, source, account_id, entity_id, entity_type, native_entity_type, native_id,
       date, currency, timezone, fetched_at, is_provisional, first_seen_at, impressions)
    values ('7c000000-0000-0000-0000-000000000001', 'ga4', 'x', 'y', 'property', 'property', 'y',
            '2026-08-20', 'EUR', 'Europe/Berlin', now(), true, now(), 1)
  $q$);

  select app_test.check_denied('an owner cannot UPDATE their own numbers', $q$
    update public.envelope_rows set sessions = 999999
     where workspace_id = '7c000000-0000-0000-0000-000000000001'
  $q$);

  select app_test.check_denied('an owner cannot DELETE an envelope row', $q$
    delete from public.envelope_rows where workspace_id = '7c000000-0000-0000-0000-000000000001'
  $q$);

  -- THE MOST DANGEROUS HOLE IN THIS MIGRATION, and the suite missed it until a mutation granted the
  -- function to `authenticated` and every assertion still passed. upsert_envelope_row is SECURITY
  -- DEFINER: it takes workspace_id as an ARGUMENT and does not consult RLS. A tenant able to call it
  -- could write rows into ANY workspace, which is worse than being able to write their own -- the
  -- table grant being absent would stop nothing.
  select app_test.check_denied('an owner cannot call the ingest function for their own workspace',
    $q$select app.upsert_envelope_row(
        p_workspace_id => '7c000000-0000-0000-0000-000000000001',
        p_connection_id => null, p_source => 'ga4',
        p_account_id => 'x', p_entity_id => 'forged', p_entity_type => 'property',
        p_native_entity_type => 'property', p_native_id => 'x',
        p_date => '2026-08-20', p_currency => 'EUR', p_timezone => 'Europe/Berlin',
        p_attribution_window => null,
        p_fetched_at => now(), p_first_seen_at => now(), p_impressions => 1)$q$);

  select app_test.check_denied('and certainly not for somebody else''s workspace',
    $q$select app.upsert_envelope_row(
        p_workspace_id => '7c000000-0000-0000-0000-000000000003',
        p_connection_id => null, p_source => 'ga4',
        p_account_id => 'x', p_entity_id => 'forged', p_entity_type => 'property',
        p_native_entity_type => 'property', p_native_id => 'x',
        p_date => '2026-08-20', p_currency => 'EUR', p_timezone => 'Europe/Berlin',
        p_attribution_window => null,
        p_fetched_at => now(), p_first_seen_at => now(), p_impressions => 1)$q$);

  set local role anon;
  select set_config('request.jwt.claim.sub', '', true);
  -- Denied before RLS is even consulted: `anon` holds no grant on this table, so the refusal is a
  -- privilege error rather than an empty result. Stronger than a zero count, and asserted as such.
  select app_test.check_denied('anon cannot read the table at all',
    'select count(*) from public.envelope_rows');
commit;

-- ---------------------------------------------------------------------------------------------
-- Privilege separation between the two system roles.
-- ---------------------------------------------------------------------------------------------
begin;
  set local role app_ingest;
  -- Enumeration and ingestion are different privileges. An ingest worker is handed one connection
  -- by the scheduler; it must not be able to discover the others.
  select app_test.check_denied('the ingest role cannot enumerate connections across tenants',
    'select count(*) from app.due_connections()');
  select app_test.check_denied('the ingest role cannot read the connections table',
    'select count(*) from public.connections');
  select app_test.check_denied('the ingest role cannot read api_keys',
    'select count(*) from public.api_keys');
  select app_test.check_denied('the ingest role cannot write the table directly, only via the function',
    $q$insert into public.envelope_rows
        (workspace_id, source, account_id, entity_id, entity_type, native_entity_type, native_id,
         date, currency, timezone, fetched_at, is_provisional, first_seen_at, impressions)
      values ('7c000000-0000-0000-0000-000000000001', 'ga4', 'x', 'y', 'property', 'property', 'y',
              '2026-08-20', 'EUR', 'Europe/Berlin', now(), true, now(), 1)$q$);
commit;

begin;
  set local role app_scheduler;
  -- And the reverse: the scheduler decides what to pull and must never be able to write a number.
  select app_test.check_denied('the scheduler cannot write envelope rows',
    $q$select app.upsert_envelope_row(
        p_workspace_id => '7c000000-0000-0000-0000-000000000001',
        p_connection_id => null, p_source => 'ga4',
        p_account_id => 'x', p_entity_id => 'y', p_entity_type => 'property',
        p_native_entity_type => 'property', p_native_id => 'y',
        p_date => '2026-08-20', p_currency => 'EUR', p_timezone => 'Europe/Berlin',
        p_attribution_window => null,
        p_fetched_at => now(), p_first_seen_at => now(), p_impressions => 1)$q$);
  select app_test.check_denied('the scheduler cannot read envelope rows either',
    'select count(*) from public.envelope_rows');
commit;

-- ---------------------------------------------------------------------------------------------
-- Deletion semantics.
-- ---------------------------------------------------------------------------------------------
begin;
  set local role app_ingest;
  select app.upsert_envelope_row(
    p_workspace_id => '7c000000-0000-0000-0000-000000000001',
    p_connection_id => '7e000000-0000-0000-0000-000000000001', p_source => 'ga4',
    p_account_id => 'properties/123456', p_entity_id => 'properties/123456',
    p_entity_type => 'property', p_native_entity_type => 'property',
    p_native_id => 'properties/123456',
    p_date => '2026-08-22', p_currency => 'EUR', p_timezone => 'Europe/Berlin',
    p_attribution_window => 'model',
    p_fetched_at => '2026-08-23T06:00:00Z', p_first_seen_at => '2026-08-23T06:00:00Z',
    p_sessions => 42);

  reset role;
  delete from public.connections where id = '7e000000-0000-0000-0000-000000000001';

  -- Retiring a connection must not erase the history it produced. A customer who disconnects an ad
  -- account still owns the numbers already pulled.
  select app_test.check('deleting a connection keeps its rows',
    (select count(*) = 1 from public.envelope_rows
      where workspace_id = '7c000000-0000-0000-0000-000000000001' and date = '2026-08-22'));
  select app_test.check('and nulls the link rather than dangling it',
    (select connection_id is null from public.envelope_rows
      where workspace_id = '7c000000-0000-0000-0000-000000000001' and date = '2026-08-22'));
commit;

begin;
  set local role app_ingest;
  select app.upsert_envelope_row(
    p_workspace_id => '7c000000-0000-0000-0000-000000000003',
    p_connection_id => null, p_source => 'ga4',
    p_account_id => 'properties/999', p_entity_id => 'properties/999',
    p_entity_type => 'property', p_native_entity_type => 'property', p_native_id => 'properties/999',
    p_date => '2026-08-24', p_currency => 'EUR', p_timezone => 'Europe/Berlin',
    p_attribution_window => 'model',
    p_fetched_at => '2026-08-25T06:00:00Z', p_first_seen_at => '2026-08-25T06:00:00Z',
    p_sessions => 7);

  reset role;
  -- A HARD delete of the workspace takes the data with it, which is what "delete my data" has to
  -- mean when a customer means it.
  delete from public.workspaces where id = '7c000000-0000-0000-0000-000000000003';
  select app_test.check('deleting a workspace cascades to its rows',
    (select count(*) = 0 from public.envelope_rows
      where workspace_id = '7c000000-0000-0000-0000-000000000003'));
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
  if v_failed > 0 then raise exception 'envelope store: % assertion(s) failed', v_failed; end if;
end $$;
