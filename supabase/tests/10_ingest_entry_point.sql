-- The ingest entry point: does it actually write, and can only the right role call it?
--
-- 07_anon_grants.sql asserts the PRIVILEGES on public.ingest_envelope_rows. This asserts the
-- BEHAVIOUR, which is a different question and the one that decides whether a pull produces
-- anything. A function that is correctly locked down and silently writes nothing passes every
-- assertion in that file.
--
-- The cases that matter are the ones a batch forwarder gets wrong:
--   * the count it returns must be the count that landed, not the count it was handed;
--   * a re-pull of the same key must UPDATE, not duplicate -- the forwarder must not have broken
--     the upsert semantics the whole envelope store rests on;
--   * `first_seen_at` must survive that second write, because the restatement guarantee is
--     anchored on it;
--   * `position` must arrive, because it was appended to app.upsert_envelope_row's signature after
--     the rest and is exactly the argument a hand-written forwarder drops.

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

-- ---------------------------------------------------------------------------------------------
-- Fixture, then a real batch through the real function.
-- ---------------------------------------------------------------------------------------------
do $$
declare
  v_reached     boolean := false;
  v_error       text;
  v_written     integer;
  v_rows        integer;
  v_position    numeric;
  v_revenue     numeric;
  v_first_seen  timestamptz;
  v_first_seen2 timestamptz;
  v_rows_after  integer;
  v_revenue2    numeric;
  v_refused     boolean := false;
begin
  begin
    insert into auth.users (id, email) values
      ('b0000000-0000-4000-8000-000000000001', 'ingest@test.test') on conflict do nothing;
    insert into public.organisations (id, name, slug) values
      ('b1000000-0000-4000-8000-000000000001', 'Ingest Org', 'ingest-org') on conflict do nothing;
    insert into public.workspaces (id, organisation_id, name, slug) values
      ('b2000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001',
       'Ingest Workspace', 'ingest-workspace') on conflict do nothing;

    -- TWO ROWS, TWO SOURCES, so the enum casts are exercised on more than one value and a
    -- commerce row sits beside a search row -- the shape a real multi-connector pull produces.
    select public.ingest_envelope_rows($json$[
      {
        "workspace_id": "b2000000-0000-4000-8000-000000000001",
        "connection_id": null,
        "source": "woocommerce",
        "account_id": "https://shop.example.com",
        "entity_id": "wc_1001",
        "entity_type": "order",
        "native_entity_type": "shop_order",
        "native_id": "1001",
        "date": "2026-08-14",
        "currency": "THB",
        "timezone": "Asia/Bangkok",
        "attribution_window": null,
        "fetched_at": "2026-08-15T06:00:00Z",
        "first_seen_at": "2026-08-15T06:00:00Z",
        "restates_until": "2026-08-22T06:00:00Z",
        "orders": 1,
        "revenue": 450.00,
        "fees": 13.50,
        "net_revenue": 436.50
      },
      {
        "workspace_id": "b2000000-0000-4000-8000-000000000001",
        "connection_id": null,
        "source": "search_console",
        "account_id": "sc-domain:example.com",
        "entity_id": "query:widgets",
        "entity_type": "query",
        "native_entity_type": "query",
        "native_id": "widgets",
        "date": "2026-08-14",
        "currency": "XXX",
        "timezone": "America/Los_Angeles",
        "attribution_window": null,
        "fetched_at": "2026-08-15T06:00:00Z",
        "first_seen_at": "2026-08-15T06:00:00Z",
        "restates_until": "2026-09-11T06:00:00Z",
        "clicks": 412,
        "impressions": 9100,
        "position": 6.2
      }
    ]$json$::jsonb) into v_written;

    select count(*) into v_rows from public.envelope_rows
     where workspace_id = 'b2000000-0000-4000-8000-000000000001';

    select position into v_position from public.envelope_rows
     where entity_id = 'query:widgets';
    select revenue, first_seen_at into v_revenue, v_first_seen from public.envelope_rows
     where entity_id = 'wc_1001';

    -- THE RE-PULL. Same upsert key, a revised figure, a later fetch. This must update in place and
    -- must not move first_seen_at -- the restatement anchor the product's central guarantee rests
    -- on. A forwarder that passed first_seen_at through to an INSERT would look fine here until
    -- the day somebody asked why is_provisional never cleared.
    perform public.ingest_envelope_rows($json$[
      {
        "workspace_id": "b2000000-0000-4000-8000-000000000001",
        "connection_id": null,
        "source": "woocommerce",
        "account_id": "https://shop.example.com",
        "entity_id": "wc_1001",
        "entity_type": "order",
        "native_entity_type": "shop_order",
        "native_id": "1001",
        "date": "2026-08-14",
        "currency": "THB",
        "timezone": "Asia/Bangkok",
        "attribution_window": null,
        "fetched_at": "2026-08-16T06:00:00Z",
        "first_seen_at": "2026-08-16T06:00:00Z",
        "restates_until": "2026-08-22T06:00:00Z",
        "orders": 1,
        "revenue": 400.00,
        "fees": 13.50,
        "net_revenue": 386.50
      }
    ]$json$::jsonb);

    select count(*) into v_rows_after from public.envelope_rows
     where workspace_id = 'b2000000-0000-4000-8000-000000000001';
    select revenue, first_seen_at into v_revenue2, v_first_seen2 from public.envelope_rows
     where entity_id = 'wc_1001';

    -- A non-array is a caller bug and must be refused, not silently treated as zero rows.
    begin
      perform public.ingest_envelope_rows('{"not": "an array"}'::jsonb);
    exception when others then
      v_refused := true;
    end;

    v_reached := true;
    raise exception 'discarding the fixture';
  exception
    when others then
      if sqlerrm <> 'discarding the fixture' then v_error := sqlerrm; end if;
  end;

  perform app_test.check(
    'the ingest block ran to completion, so the verdicts below mean something',
    v_reached,
    coalesce('the block aborted early: ' || v_error, 'no error was captured'));

  perform app_test.check('a two-row batch reports two written', v_written = 2,
    format('returned %s', coalesce(v_written::text, 'null')));
  perform app_test.check('and two rows actually landed', v_rows = 2,
    format('found %s row(s)', coalesce(v_rows::text, 'null')));

  -- The argument a hand-written forwarder drops: appended to the signature after everything else.
  perform app_test.check('position survives the forwarder', v_position = 6.2,
    format('stored position was %s', coalesce(v_position::text, 'null')));
  perform app_test.check('a currency metric survives the forwarder', v_revenue = 450.00,
    format('stored revenue was %s', coalesce(v_revenue::text, 'null')));

  perform app_test.check('a re-pull UPDATES rather than duplicating', v_rows_after = 2,
    format('after the re-pull there were %s row(s)', coalesce(v_rows_after::text, 'null')));
  perform app_test.check('the revised figure replaced the old one', v_revenue2 = 400.00,
    format('revenue after the re-pull was %s', coalesce(v_revenue2::text, 'null')));
  perform app_test.check(
    'first_seen_at is PRESERVED across the re-pull, which the restatement anchor depends on',
    v_first_seen2 = v_first_seen,
    format('first_seen_at moved from %s to %s', v_first_seen, v_first_seen2));

  perform app_test.check('a non-array argument is refused rather than read as zero rows', v_refused);
end $$;

-- ---------------------------------------------------------------------------------------------
-- THE TENANT INVARIANT, executed rather than inferred from an ACL.
--
-- 07_anon_grants.sql asserts `has_function_privilege` is false for anon and authenticated. This
-- CALLS it as `authenticated` and asserts the call is refused -- the same distinction that file
-- draws for consume_api_key_credits, and for the same reason: a privilege check is not a proof
-- that the privilege is enforced.
-- ---------------------------------------------------------------------------------------------
do $$
declare v_denied boolean := false;
begin
  begin
    set local role authenticated;
    perform public.ingest_envelope_rows('[]'::jsonb);
    reset role;
  exception when insufficient_privilege then
    reset role;
    v_denied := true;
  when others then
    reset role;
  end;

  perform app_test.check(
    'a tenant calling the ingest entry point is refused, not merely ungranted',
    v_denied,
    'a tenant able to call this could fabricate the numbers the product guarantees');
end $$;

-- ---------------------------------------------------------------------------------------------
-- Summary. The floor is asserted for the reason given in 06_jwt_claims.sql.
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
  if v_failed > 0 then raise exception 'ingest entry point: % assertion(s) failed', v_failed; end if;
  if v_total < 10 then
    raise exception 'ingest entry point: only % assertion(s) ran; expected at least 10', v_total;
  end if;
end $$;
