-- `position`: the first metric in this schema that is not a sum.
--
-- WHAT IT IS. Average SERP rank, from Search Console, which returns it on every row. The connector
-- has been reading it and dropping it since it shipped, and `packages/contract/src/registry.ts`
-- records why: precedence rule 3. Nothing in the dictionary is a rank, and unlike `ctr` -- which is
-- clicks over impressions and stays out permanently for that reason -- it cannot be derived from
-- anything that is.
--
-- WHY THE COLUMN COULD NOT SHIP ALONE. It is NOT ADDITIVE, and it is the only column here that is
-- not:
--
--   * Positions across two days do not add to a position.
--   * They do not plainly average either. Search Console's own figure is weighted by impressions,
--     so a query seen 40,000 times at rank 3 and one seen 12 times at rank 30 must not count
--     equally. The simple mean is 16.5; the true figure is 3.008. Both are printable.
--
-- Every other metric in this table is additive, and nothing said so, because until now it was
-- universally true. So the dictionary gained an `aggregation` field in the same change, every
-- existing metric declares `sum`, and `combineMetric` in packages/contract implements the rule --
-- the point being that the first person to roll a week up does not reach for SUM and get a number
-- that looks like a rank and is not one.
--
-- NAMED `position`, NOT `avg_position`. The stored value is the PLATFORM's figure for that row,
-- not an average this system computed. How rows combine is what `aggregation` says, in a place a
-- test can check; putting it in the column name would duplicate the fact somewhere nothing can.
-- (`position` is a col_name keyword in PostgreSQL and works unquoted as a column name -- verified
-- for a bare select, an `is distinct from`, and a plpgsql parameter, before choosing it.)

-- `> 0`, NOT `>= 0`, AND THE DIFFERENCE MATTERS. A SERP position is a 1-based ordinal; rank zero
-- does not exist. It is also the most misleading value available -- zero reads as the BEST possible
-- rank, so a bug that wrote it would present as a site suddenly ranking above position one.
alter table public.envelope_rows
  add column position numeric(20, 6) check (position is null or position > 0);

comment on column public.envelope_rows.position is
  'Average SERP position, as the platform reported it for this row. NOT ADDITIVE: re-aggregating '
  'across rows requires weighting by impressions -- see combineMetric in packages/contract. Never '
  'SUM this column, and never plainly AVG it either.';

-- DELIBERATELY NOT ADDED to envelope_rows_converted_needs_rate. That constraint lists the CURRENCY
-- metrics, because a converted amount needs the rate that produced it. A rank is not money and is
-- not converted; adding it would make the constraint refuse true rows.

-- ---------------------------------------------------------------------------------------------
-- The upsert. DROPPED AND RECREATED, NOT REPLACED.
--
-- `create or replace function` matches on (name, argument types). Adding `p_position` changes the
-- argument types, so a replace would CREATE A SECOND FUNCTION and leave the old one in place --
-- exactly the defect 20260911000200_credits_need_the_key.sql was written to fix, one schema over.
-- An ingest worker calling the old signature would write every metric except this one, forever,
-- with nothing failing.
-- ---------------------------------------------------------------------------------------------
drop function if exists app.upsert_envelope_row(
  uuid, uuid, app.envelope_source, text, text, app.entity_type, text, text, date, text, text,
  app.attribution_window, timestamptz, timestamptz, timestamptz, timestamptz, text, text,
  numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric,
  numeric, text, date, numeric, text, text
);

create function app.upsert_envelope_row(
  p_workspace_id       uuid,
  p_connection_id      uuid,
  p_source             app.envelope_source,
  p_account_id         text,
  p_entity_id          text,
  p_entity_type        app.entity_type,
  p_native_entity_type text,
  p_native_id          text,
  p_date               date,
  p_currency           text,
  p_timezone           text,
  p_attribution_window app.attribution_window,
  p_fetched_at         timestamptz,
  p_first_seen_at      timestamptz,
  p_restates_until     timestamptz default null,
  p_source_updated_at  timestamptz default null,
  p_entity_name        text default null,
  p_parent_id          text default null,
  p_spend              numeric default null,
  p_impressions        numeric default null,
  p_clicks             numeric default null,
  p_sessions           numeric default null,
  p_conversions        numeric default null,
  p_conversions_value  numeric default null,
  p_revenue            numeric default null,
  p_orders             numeric default null,
  p_net_revenue        numeric default null,
  p_fees               numeric default null,
  p_commission         numeric default null,
  -- Appended, after every existing parameter, so a named call written against the old signature
  -- keeps meaning what it meant.
  p_position           numeric default null,
  p_fx_source          text default null,
  p_fx_rate_date       date default null,
  p_fx_rate            numeric default null,
  p_fx_base            text default null,
  p_raw_key            text default null
)
returns void
language sql
volatile
security definer
set search_path = public, pg_temp
as $$
  insert into public.envelope_rows (
    workspace_id, connection_id, source, account_id, entity_id, entity_type,
    native_entity_type, native_id, entity_name, parent_id,
    date, currency, timezone, attribution_window,
    spend, impressions, clicks, sessions, conversions, conversions_value, revenue,
    orders, net_revenue, fees, commission, position,
    fetched_at, source_updated_at, restates_until, is_provisional, first_seen_at,
    fx_source, fx_rate_date, fx_rate, fx_base, raw_key
  ) values (
    p_workspace_id, p_connection_id, p_source, p_account_id, p_entity_id, p_entity_type,
    p_native_entity_type, p_native_id, p_entity_name, p_parent_id,
    p_date, p_currency, p_timezone, p_attribution_window,
    p_spend, p_impressions, p_clicks, p_sessions, p_conversions, p_conversions_value, p_revenue,
    p_orders, p_net_revenue, p_fees, p_commission, p_position,
    p_fetched_at, p_source_updated_at, p_restates_until,
    -- An unknown window is treated as still open. Assuming a finality we cannot demonstrate is the
    -- failure the whole envelope exists to prevent.
    (p_restates_until is null or p_fetched_at < p_restates_until),
    p_first_seen_at,
    p_fx_source, p_fx_rate_date, p_fx_rate, p_fx_base, p_raw_key
  )
  on conflict on constraint envelope_rows_pkey do update set
    -- Restated values: whatever the platform says now.
    connection_id      = excluded.connection_id,
    entity_type        = excluded.entity_type,
    native_entity_type = excluded.native_entity_type,
    native_id          = excluded.native_id,
    entity_name        = excluded.entity_name,
    parent_id          = excluded.parent_id,
    currency           = excluded.currency,
    timezone           = excluded.timezone,
    spend              = excluded.spend,
    impressions        = excluded.impressions,
    clicks             = excluded.clicks,
    sessions           = excluded.sessions,
    conversions        = excluded.conversions,
    conversions_value  = excluded.conversions_value,
    revenue            = excluded.revenue,
    orders             = excluded.orders,
    net_revenue        = excluded.net_revenue,
    fees               = excluded.fees,
    commission         = excluded.commission,
    position           = excluded.position,
    fetched_at         = excluded.fetched_at,
    source_updated_at  = excluded.source_updated_at,
    fx_source          = excluded.fx_source,
    fx_rate_date       = excluded.fx_rate_date,
    fx_rate            = excluded.fx_rate,
    fx_base            = excluded.fx_base,
    raw_key            = excluded.raw_key,
    updated_at         = now(),

    -- PRESERVED. Written out rather than omitted, so the intent survives the next column addition.
    first_seen_at      = public.envelope_rows.first_seen_at,
    restates_until     = public.envelope_rows.restates_until,

    -- DERIVED from the preserved window. This line is where "is_provisional eventually clears"
    -- stops being a claim and becomes a fact.
    is_provisional     = (
      public.envelope_rows.restates_until is null
      or excluded.fetched_at < public.envelope_rows.restates_until
    );
$$;

-- ---------------------------------------------------------------------------------------------
-- The restatement pair. BOTH halves, because they fail differently and both fail silently.
--
-- A metric present in the trigger's `when` but absent from `record_restatement` fires PL/pgSQL,
-- builds an empty `v_before`, and the function declines -- so the update happens and NO EVENT IS
-- RECORDED. A metric absent from the `when` never wakes the trigger at all. Either way a customer
-- who was promised notification of a restatement does not get one, and nothing errors.
--
-- `check-dictionary.mjs` checked the `when` clause and not the function body. It now checks both.
-- ---------------------------------------------------------------------------------------------
create or replace function app.record_restatement()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_before jsonb := '{}'::jsonb;
  v_after  jsonb := '{}'::jsonb;
begin
  -- Built pair by pair rather than by diffing two whole maps, because `to_jsonb(old)` would carry
  -- every column -- the clocks, the fx fields, `raw_key` -- and a diff over those would call a
  -- fresh `fetched_at` a restatement. Only metrics are restatements.
  if old.spend is distinct from new.spend then
    v_before := v_before || jsonb_build_object('spend', old.spend);
  end if;
  if old.impressions is distinct from new.impressions then
    v_before := v_before || jsonb_build_object('impressions', old.impressions);
  end if;
  if old.clicks is distinct from new.clicks then
    v_before := v_before || jsonb_build_object('clicks', old.clicks);
  end if;
  if old.sessions is distinct from new.sessions then
    v_before := v_before || jsonb_build_object('sessions', old.sessions);
  end if;
  if old.conversions is distinct from new.conversions then
    v_before := v_before || jsonb_build_object('conversions', old.conversions);
  end if;
  if old.conversions_value is distinct from new.conversions_value then
    v_before := v_before || jsonb_build_object('conversions_value', old.conversions_value);
  end if;
  if old.revenue is distinct from new.revenue then
    v_before := v_before || jsonb_build_object('revenue', old.revenue);
  end if;
  if old.orders is distinct from new.orders then
    v_before := v_before || jsonb_build_object('orders', old.orders);
  end if;
  if old.net_revenue is distinct from new.net_revenue then
    v_before := v_before || jsonb_build_object('net_revenue', old.net_revenue);
  end if;
  if old.fees is distinct from new.fees then
    v_before := v_before || jsonb_build_object('fees', old.fees);
  end if;
  if old.commission is distinct from new.commission then
    v_before := v_before || jsonb_build_object('commission', old.commission);
  end if;
  -- A rank moving IS a restatement. Search Console revises its trailing days like any other
  -- platform, and "you ranked 4th, not 2nd, last Tuesday" is exactly the correction the outbox
  -- exists to announce. Absent from here, the trigger below would fire, this function would build
  -- an empty diff and decline, and the update would land with NO EVENT RECORDED.
  if old.position is distinct from new.position then
    v_before := v_before || jsonb_build_object('position', old.position);
  end if;

  -- Nothing moved. The trigger's `when` clause should already have prevented this call, so reaching
  -- here means the two metric lists have drifted apart -- and writing an event with an empty diff
  -- would be caught by the check constraint anyway. Return quietly rather than raising: a failed
  -- trigger would roll back a customer's ingest over a bookkeeping disagreement.
  if v_before = '{}'::jsonb then
    return null;
  end if;

  -- `strip_nulls` so an absent metric is absent, not `null`. A consumer reading `spend: null` would
  -- reasonably conclude the platform reported zero spend.
  v_after := jsonb_strip_nulls(jsonb_build_object('spend', new.spend, 'impressions', new.impressions, 'clicks', new.clicks, 'sessions', new.sessions, 'conversions', new.conversions, 'conversions_value', new.conversions_value, 'revenue', new.revenue, 'orders', new.orders, 'net_revenue', new.net_revenue, 'fees', new.fees, 'commission', new.commission, 'position', new.position));

  insert into public.restatement_events (
    workspace_id, source, account_id, entity_id, entity_type, date, attribution_window,
    currency, revised_from, metrics,
    fetched_at, first_seen_at, restates_until, is_provisional
  ) values (
    new.workspace_id, new.source, new.account_id, new.entity_id, new.entity_type, new.date,
    new.attribution_window, new.currency, v_before, v_after,
    new.fetched_at, new.first_seen_at, new.restates_until, new.is_provisional
  );
  return null;
end;
$fn$;

drop trigger if exists envelope_rows_restated on public.envelope_rows;

create trigger envelope_rows_restated
  after update on public.envelope_rows
  for each row
  when (
    old.spend is distinct from new.spend
    or old.impressions is distinct from new.impressions
    or old.clicks is distinct from new.clicks
    or old.sessions is distinct from new.sessions
    or old.conversions is distinct from new.conversions
    or old.conversions_value is distinct from new.conversions_value
    or old.revenue is distinct from new.revenue
    or old.orders is distinct from new.orders
    or old.net_revenue is distinct from new.net_revenue
    or old.fees is distinct from new.fees
    or old.commission is distinct from new.commission
    or old.position is distinct from new.position
  )
  execute function app.record_restatement();

-- ---------------------------------------------------------------------------------------------
-- THE GRANTS, WHICH THE DROP TOOK WITH IT.
--
-- Not housekeeping. A dropped function takes its ACL to the grave, and PostgreSQL's BUILT-IN
-- default for a new function grants EXECUTE to PUBLIC -- so recreating this one without the
-- revoke below leaves every role able to write envelope rows directly, bypassing row-level
-- security entirely. The whole point of `security definer` here is that the privilege is the
-- FUNCTION and not the role; a PUBLIC grant hands it to everybody.
--
-- 20260911000200_credits_need_the_key.sql wrote this hazard down for functions in `public`. It
-- applies identically in `app`, and `03_envelope_store.sql` proved it by failing three assertions
-- the moment the drop above was added without these two statements -- "an owner cannot call the
-- ingest function for their own workspace: POLICY BYPASS: affected 1 row(s)". That suite is the
-- reason this is a paragraph rather than an incident.
revoke all on function app.upsert_envelope_row(
  uuid, uuid, app.envelope_source, text, text, app.entity_type, text, text, date, text, text,
  app.attribution_window, timestamptz, timestamptz, timestamptz, timestamptz, text, text,
  numeric, numeric, numeric, numeric, numeric, numeric, numeric,
  numeric, numeric, numeric, numeric, numeric,
  text, date, numeric, text, text
) from public, anon, authenticated;

grant execute on function app.upsert_envelope_row(
  uuid, uuid, app.envelope_source, text, text, app.entity_type, text, text, date, text, text,
  app.attribution_window, timestamptz, timestamptz, timestamptz, timestamptz, text, text,
  numeric, numeric, numeric, numeric, numeric, numeric, numeric,
  numeric, numeric, numeric, numeric, numeric,
  text, date, numeric, text, text
) to app_ingest;
