-- The envelope store.
--
-- THIS TABLE EXISTS TO KEEP ONE PROMISE. docs/marketplane/14-ga4-backfill.md ends with an
-- obligation: a connector emits `first_seen_at = fetched_at` on every row, because a connector has
-- no store and cannot know whether a row already exists. If the upsert overwrites `first_seen_at`,
-- the restatement anchor slides forward on every nightly re-pull, `restates_until` slides with it,
-- `is_provisional` never clears, and THE ONE GUARANTEE THE PRODUCT SELLS NEVER COMES TRUE.
--
-- That is not a hypothetical. It is the exact defect packages/contract/src/restatement.ts identifies
-- in the specification's own formula (`restates_until = fetched_at + Nd`), and an upsert written the
-- obvious way -- `set ... = excluded....` for every column -- reintroduces it one layer down. So the
-- preservation is written EXPLICITLY below rather than achieved by omitting two columns from a SET
-- list, where the next person to add a column would silently undo it.
--
-- THREE OTHER DECISIONS ARE WORTH READING BEFORE CHANGING ANYTHING HERE.
--
-- 1. NO TENANT IDENTITY MAY WRITE THIS TABLE. Not a human, not an API key. These rows are derived
--    platform data, not user input, and a tenant able to write them could fabricate the numbers the
--    product's guarantee rests on. Writes go through one function granted to one system role, the
--    same shape as the scheduler in 20260908001000_scheduler.sql -- and deliberately a DIFFERENT
--    role, because enumeration and ingestion are different privileges: the scheduler learns which
--    connections are due and can never read a credential or write a number; the ingest worker opens
--    one credential and writes one workspace's rows and can never enumerate.
--
-- 2. `raw` IS AN R2 OBJECT KEY, NEVER THE PAYLOAD. Section 7 names Supabase disk at $0.125/GB as
--    the cost line most likely to break the model, and the design-note template says this outright:
--    "only safe if `raw` is an R2 KEY in Postgres, never a JSONB blob". A `jsonb` column here would
--    work perfectly in testing and become the largest line on the bill.
--
-- 3. THE API'S REFUSAL IS RESTATED AS A CHECK CONSTRAINT. Specification section 2: "the API refuses
--    to emit an unlabelled conversion count". packages/contract/src/envelope.ts refuses it in zod.
--    A rule enforced in one place is one code path away from being unenforced, and this is the
--    place that outlives every code path.

-- ---------------------------------------------------------------------------------------------
-- Dictionary types
-- ---------------------------------------------------------------------------------------------
--
-- These mirror @repo/contract exactly, and `scripts/check-dictionary.mjs` fails the build if they
-- drift. Two representations of one dictionary is how section 13.3's rule 2 gets quietly broken.

-- NOT app.connection_provider, and the difference is the point: `dataforseo_serp` and `ai_answers`
-- are BOUGHT PUBLIC DATA under a company-held key (section 11.2), so they are sources with no
-- connection and no customer credential. A source is not a provider.
create type app.envelope_source as enum (
  'google_ads', 'meta_ads', 'ga4', 'search_console',
  'impact', 'awin', 'cj', 'partnerstack',
  'dataforseo_serp', 'ai_answers'
);

-- `order` is an addition to the ad-centric `dbt_ad_reporting` grain, made under 13.3 rule 2 by
-- decision 11A.14: the launch connector set is three commerce sources and a WooCommerce or Shopify
-- feed has no grain in this list to land on. Appended, never inserted -- PostgreSQL sorts an enum
-- by definition order, so placing it mid-list would silently rewrite every ORDER BY on the column.
create type app.entity_type as enum (
  'account', 'campaign', 'ad_group', 'ad', 'keyword', 'search_term',
  'url', 'geo', 'property', 'page', 'query', 'order'
);

-- `account_default` and `model` are labels for what a platform actually did, not absences. There is
-- deliberately no 'unknown' member: an unknown window is a NULL, and a NULL alongside a conversion
-- metric is refused by the check constraint below.
create type app.attribution_window as enum (
  '1d_click', '7d_click', '28d_click',
  '1d_view', '7d_view', '28d_view',
  -- Meta's own list, verbatim. `1d_ev` is engaged-view; `dda` and `incrementality` are models Meta
  -- returns on the same row as the click and view windows.
  '1d_ev', 'dda', 'incrementality', 'inline', 'custom',
  'account_default', 'model'
);

-- ---------------------------------------------------------------------------------------------
-- The table
-- ---------------------------------------------------------------------------------------------

create table public.envelope_rows (
  workspace_id            uuid not null references public.workspaces (id) on delete cascade,

  -- Nullable, and set null on delete rather than cascade: retiring a connection must not erase the
  -- history it produced. A customer who disconnects an ad account still owns the numbers already
  -- pulled, and deleting them would silently rewrite past reports.
  connection_id           uuid references public.connections (id) on delete set null,

  source                  app.envelope_source not null,

  -- The section 7 upsert key is (source, account_id, entity_id, date, attribution_window).
  account_id              text not null check (length(account_id) > 0),
  entity_id               text not null check (length(entity_id) > 0),
  entity_type             app.entity_type not null,

  -- The platform's own vocabulary, carried rather than hidden: Meta says "adset" where the canonical
  -- grain says "ad_group".
  native_entity_type      text not null check (length(native_entity_type) > 0),
  native_id               text not null check (length(native_id) > 0),
  entity_name             text,
  parent_id               text,

  date                    date not null,
  currency                text not null check (currency ~ '^[A-Z]{3}$'),
  -- Sections 3.1 and 4.4 sell timezone normalisation as a guarantee co-equal with currency, and the
  -- head-to-head table sells it against named competitors. Without the column it is unshippable.
  timezone                text not null check (length(timezone) > 0),
  attribution_window      app.attribution_window,

  -- METRICS ARE COLUMNS, NOT JSONB. The dictionary is small, fixed, and changing it is a deliberate
  -- act under section 13.3 rule 2 -- so flexibility is the wrong property to optimise for, and a
  -- jsonb blob could not carry the conversion check below.
  --
  -- numeric, not bigint, INCLUDING FOR COUNTS. Google Ads reports FRACTIONAL conversions under
  -- data-driven attribution, and an integer column would reject or truncate them. numeric, not
  -- double precision, because money must not round.
  spend                   numeric(20, 6) check (spend is null or spend >= 0),
  impressions             numeric(20, 6) check (impressions is null or impressions >= 0),
  clicks                  numeric(20, 6) check (clicks is null or clicks >= 0),
  sessions                numeric(20, 6) check (sessions is null or sessions >= 0),
  conversions             numeric(20, 6) check (conversions is null or conversions >= 0),
  conversions_value       numeric(20, 6) check (conversions_value is null or conversions_value >= 0),
  revenue                 numeric(20, 6) check (revenue is null or revenue >= 0),
  -- THE COMMERCE GRAIN (11A.14). `revenue` above is gross as the order source reports it; these
  -- four are what an owner actually keeps and what the platform took to get there.
  orders                  numeric(20, 6) check (orders is null or orders >= 0),
  -- NO NON-NEGATIVE CHECK, AND THE OMISSION IS DELIBERATE. A day whose refunds and chargebacks
  -- exceed its sales has a genuinely negative net. A `>= 0` check here would reject a true row and
  -- leave a connector two choices, both lies: write a floor of zero, or drop the day.
  net_revenue             numeric(20, 6),
  fees                    numeric(20, 6) check (fees is null or fees >= 0),
  commission              numeric(20, 6) check (commission is null or commission >= 0),

  -- The four clocks, flat. Section 7, line 762: "A single `freshness` timestamp cannot express three
  -- clocks, which is why the field set splits into fetched_at, source_updated_at, restates_until and
  -- is_provisional." Do not group these into a jsonb `freshness` object.
  fetched_at              timestamptz not null,
  source_updated_at       timestamptz,
  restates_until          timestamptz,
  is_provisional          boolean not null,

  -- IMMUTABLE. Written once, preserved by app.upsert_envelope_row on every subsequent pull.
  first_seen_at           timestamptz not null,

  fx_source               text,
  fx_rate_date            date,
  fx_rate                 numeric(20, 10) check (fx_rate is null or fx_rate > 0),
  fx_base                 text check (fx_base is null or fx_base ~ '^[A-Z]{3}$'),

  -- An R2 object key. See decision 3 in the header.
  raw_key                 text,

  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),

  -- THE REFUSAL, restated where it outlives every code path. Section 2 and section 4.4: "the API
  -- refuses to emit an unlabelled conversion count."
  constraint envelope_rows_conversion_needs_window check (
    (conversions is null and conversions_value is null)
    or attribution_window is not null
  ),

  -- A converted amount must carry the rate that produced it, not only its provenance. Section 13.3
  -- requires "the rate and source recorded on the row"; a source and a date cannot reproduce a
  -- number when ECB publishes on business days only.
  -- EVERY currency metric belongs in this list. The contract finds them by asking METRICS for the
  -- ones whose unit is currency; SQL cannot, so the list is written out and a new currency metric
  -- must be added here by hand. The dictionary guard compares names, not constraints, and would
  -- not catch the omission -- `03_envelope_store.sql` asserts it instead.
  constraint envelope_rows_converted_needs_rate check (
    fx_source is null
    or (
      spend is null and conversions_value is null and revenue is null
      and net_revenue is null and fees is null and commission is null
    )
    or fx_rate is not null
  ),

  -- THE SECOND REFUSAL (11A.14), the first one applied to the commerce grain. A shop's own orders
  -- and money are unattributed -- until they appear on a campaign, ad group, ad, keyword or search
  -- term, where a platform can only have produced them by attributing. A marketplace ad platform
  -- reporting "orders from this campaign" is reporting a conversion, and letting it through under a
  -- name the first refusal does not cover would lose the guarantee to a synonym.
  constraint envelope_rows_commerce_on_ad_entity_needs_window check (
    entity_type not in ('campaign', 'ad_group', 'ad', 'keyword', 'search_term')
    or (
      orders is null and revenue is null and net_revenue is null
      and fees is null and commission is null
    )
    or attribution_window is not null
  ),

  -- A guard against the one mistake that would quietly cost the most: storing the payload in the
  -- key column. Section 7 names Supabase disk as the line most likely to break the cost model.
  constraint envelope_rows_raw_is_a_key check (raw_key is null or raw_key !~ '^\s*[{\[]'),

  -- THE UPSERT KEY, from section 7, with workspace_id ahead of it because no key in this schema is
  -- allowed to span tenants.
  --
  -- NULLS NOT DISTINCT IS LOAD-BEARING. `attribution_window` is legitimately null on an
  -- impressions-only row, and PostgreSQL's DEFAULT unique-constraint behaviour treats two NULLs as
  -- different values -- so a plain UNIQUE would silently accept unlimited duplicates of exactly
  -- those rows, and every re-pull would insert another copy instead of updating one. The duplicate
  -- is invisible until someone sums the column.
  constraint envelope_rows_pkey unique nulls not distinct
    (workspace_id, source, account_id, entity_id, date, attribution_window)
);

-- ---------------------------------------------------------------------------------------------
-- The restatement outbox
--
-- Specification section 4.2: "When Meta restates a 28-day window or Google Ads credits a late
-- conversion back to its click date, the row changes. A `restated` webhook with the BEFORE AND
-- AFTER VALUES is the alert every analyst wants and no incumbent sends."
--
-- THE HARD PART IS SILENCE, NOT NOISE. The tiered ladder re-pulls every row in the window every
-- night. Almost all of those re-pulls change nothing, and a webhook that fires on each of them is
-- worse than no webhook: the customer turns it off in a week, and the one night a number really
-- moves is buried with the rest.
--
-- So detection is a TRIGGER WITH A `when` CLAUSE, not application logic. PostgreSQL evaluates the
-- condition itself and never calls the function on a re-pull that moved nothing. That property
-- cannot be forgotten by a future writer, because it does not live in any writer: a row updated by
-- `app.upsert_envelope_row`, by a migration, or by a hand at a psql prompt is detected identically.
--
-- `revised_from` carries ONLY THE METRICS THAT CHANGED. Section 4.2's "before and after" is a diff,
-- and listing a metric that did not move under a heading that says "revised from" would state that
-- it moved. The full current metric set travels beside it, so the event is still self-contained.
-- `00-repo-map.md`: revised_from is "placed in the restatement webhook payload, not on the read
-- row", which is why it lives here and not in `envelope_rows`.
-- ---------------------------------------------------------------------------------------------

create table public.restatement_events (
  id                      uuid primary key default gen_random_uuid(),
  workspace_id            uuid not null references public.workspaces (id) on delete cascade,

  -- The upsert key of the row that moved, so a consumer can fetch it back.
  source                  app.envelope_source not null,
  account_id              text not null check (length(account_id) > 0),
  entity_id               text not null check (length(entity_id) > 0),
  entity_type             app.entity_type not null,
  date                    date not null,
  attribution_window      app.attribution_window,

  currency                text not null check (currency ~ '^[A-Z]{3}$'),

  -- Metric maps, not columns, and the exception is deliberate. `envelope_rows` keeps metrics as
  -- columns because the dictionary is small and fixed and a check constraint has to see them. An
  -- event is an immutable record of a diff whose SHAPE varies per event -- only the metrics that
  -- moved appear -- and a column per metric would be mostly null on every row.
  revised_from            jsonb not null check (jsonb_typeof(revised_from) = 'object'),
  metrics                 jsonb not null check (jsonb_typeof(metrics) = 'object'),

  -- The envelope's clocks as they stood when the change was seen. A consumer must be able to tell a
  -- restatement inside an open window from one that arrived after it should have closed.
  fetched_at              timestamptz not null,
  first_seen_at           timestamptz not null,
  restates_until          timestamptz,
  is_provisional          boolean not null,

  occurred_at             timestamptz not null default now(),

  -- DELIVERY STATE. The state machine over these columns lives in `app.record_delivery`
  -- (20260908001200_webhook_delivery.sql), which is the only thing that writes them.
  --
  -- Three terminal-ish states, and the difference between them matters to an operator: an event
  -- with `delivered_at` succeeded; one with `failed_at` exhausted its retries and will never be
  -- attempted again; one with neither is still in the queue, whatever its attempt count.
  attempts                integer not null default 0 check (attempts >= 0),
  delivered_at            timestamptz,
  failed_at               timestamptz,
  next_attempt_at         timestamptz not null default now(),
  last_error              text,

  -- A lease, so two workers cannot deliver the same event twice. Same shape as the connection lease
  -- in the scheduler, for the same reason.
  claimed_at              timestamptz,
  claimed_by              text,

  constraint restatement_events_not_both_outcomes check (
    delivered_at is null or failed_at is null
  ),

  constraint restatement_events_diff_not_empty check (revised_from <> '{}'::jsonb)
);

comment on table public.restatement_events is
  'One row per detected restatement. Written only by the trigger below, never by a tenant: an event '
  'a customer could forge is an alert nobody can trust.';

comment on column public.restatement_events.revised_from is
  'ONLY the metrics whose value changed, with their previous values. Naming an unchanged metric '
  'here would assert that it moved.';

-- Drained in occurrence order, oldest first, per workspace.
create index restatement_events_pending_idx
  on public.restatement_events (workspace_id, occurred_at)
  where delivered_at is null;

-- Record one restatement.
--
-- SECURITY DEFINER for the same reason `app.upsert_envelope_row` is: the writer is `app_ingest`,
-- which has no grant on this table and must not have one. The privilege is the function, not the
-- role -- and here it is narrower still, because nothing calls this function at all. Only the
-- trigger does.
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

  -- Nothing moved. The trigger's `when` clause should already have prevented this call, so reaching
  -- here means the two metric lists have drifted apart -- and writing an event with an empty diff
  -- would be caught by the check constraint anyway. Return quietly rather than raising: a failed
  -- trigger would roll back a customer's ingest over a bookkeeping disagreement.
  if v_before = '{}'::jsonb then
    return null;
  end if;

  -- `strip_nulls` so an absent metric is absent, not `null`. A consumer reading `spend: null` would
  -- reasonably conclude the platform reported zero spend.
  v_after := jsonb_strip_nulls(jsonb_build_object('spend', new.spend, 'impressions', new.impressions, 'clicks', new.clicks, 'sessions', new.sessions, 'conversions', new.conversions, 'conversions_value', new.conversions_value, 'revenue', new.revenue, 'orders', new.orders, 'net_revenue', new.net_revenue, 'fees', new.fees, 'commission', new.commission));

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

-- WHAT THIS CLAUSE IS AND IS NOT. It is the COST guarantee, not the correctness one, and the
-- distinction was established by breaking it: deleting the clause entirely leaves every assertion
-- in `04_restatement_events.sql` passing, because the function above declines on its own when
-- nothing moved. What changes is that PL/pgSQL is then entered for every re-pull of every row --
-- the same answer at a few hundred times the cost, on the hottest write path in the system.
--
-- Correctness rests on `v_before = '{}'` in the function; cost rests on this clause; and the two
-- staying in step rests on `scripts/check-dictionary.mjs`, which is the only thing that fails when
-- a metric is missing from one and present in the other. A comment here previously claimed this
-- clause was the feature. It is not, and the mutation that survived is why the claim is gone.
--
-- EVERY METRIC BELONGS IN THIS LIST. It is the third hand-written metric list in this schema, after
-- the fx constraint above and the upsert's SET clause, and a metric missing from it restates
-- silently forever. `scripts/check-dictionary.mjs` compares this list against the dictionary for
-- exactly that reason.
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
  )
  execute function app.record_restatement();

alter table public.restatement_events enable row level security;
alter table public.restatement_events force row level security;

-- A tenant may READ its own restatements. There is deliberately no insert, update or delete policy
-- and no write grant: an event a customer could forge is an alert nobody can trust, and the same
-- argument that keeps tenants out of `envelope_rows` applies with more force to the thing that
-- announces a change to it.
create policy restatement_events_select on public.restatement_events
  for select to authenticated
  using (app.can_read_workspace(workspace_id));

grant select on public.restatement_events to authenticated;

-- The read path: one workspace, one source, a date range. Ordered by date so a range scan does not
-- sort.
create index envelope_rows_read_idx
  on public.envelope_rows (workspace_id, source, date desc);

-- Rows still open to restatement, which is what the nightly re-pull looks for and what a customer
-- asking "what might still change?" is asking.
create index envelope_rows_provisional_idx
  on public.envelope_rows (workspace_id, restates_until)
  where is_provisional;

comment on column public.envelope_rows.first_seen_at is
  'Immutable insert-time anchor for restates_until. NEVER overwritten by a re-pull: see the header '
  'of this migration and packages/contract/src/restatement.ts.';

comment on column public.envelope_rows.raw_key is
  'An R2 object key, never the payload. A jsonb blob here works in testing and becomes the largest '
  'line on the bill.';

-- ---------------------------------------------------------------------------------------------
-- The ingest role, and the one function it may call
-- ---------------------------------------------------------------------------------------------

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'app_ingest') then
    create role app_ingest nologin noinherit nobypassrls;
  end if;
end $$;

grant usage on schema app to app_ingest;

/**
 * Write one envelope row.
 *
 * THE WHOLE POINT IS THE CONFLICT CLAUSE. `first_seen_at` and `restates_until` are preserved from
 * the EXISTING row, written explicitly rather than left out of the SET list, so that a future column
 * addition cannot quietly undo them.
 *
 * `is_provisional` is DERIVED from the preserved window and the new fetch time, which is where the
 * product's guarantee actually comes true: as a row's window closes, a re-pull flips the flag to
 * false. An `is_provisional` copied from the caller could never clear, because a connector cannot
 * know a row's real anchor.
 */
create or replace function app.upsert_envelope_row(
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
    orders, net_revenue, fees, commission,
    fetched_at, source_updated_at, restates_until, is_provisional, first_seen_at,
    fx_source, fx_rate_date, fx_rate, fx_base, raw_key
  ) values (
    p_workspace_id, p_connection_id, p_source, p_account_id, p_entity_id, p_entity_type,
    p_native_entity_type, p_native_id, p_entity_name, p_parent_id,
    p_date, p_currency, p_timezone, p_attribution_window,
    p_spend, p_impressions, p_clicks, p_sessions, p_conversions, p_conversions_value, p_revenue,
    p_orders, p_net_revenue, p_fees, p_commission,
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

revoke all on function app.upsert_envelope_row(
  uuid, uuid, app.envelope_source, text, text, app.entity_type, text, text, date, text, text,
  app.attribution_window, timestamptz, timestamptz, timestamptz, timestamptz, text, text,
  numeric, numeric, numeric, numeric, numeric, numeric, numeric,
  numeric, numeric, numeric, numeric,
  text, date, numeric, text, text
) from public, anon, authenticated;

grant execute on function app.upsert_envelope_row(
  uuid, uuid, app.envelope_source, text, text, app.entity_type, text, text, date, text, text,
  app.attribution_window, timestamptz, timestamptz, timestamptz, timestamptz, text, text,
  numeric, numeric, numeric, numeric, numeric, numeric, numeric,
  numeric, numeric, numeric, numeric,
  text, date, numeric, text, text
) to app_ingest;

-- ---------------------------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------------------------

alter table public.envelope_rows enable row level security;
alter table public.envelope_rows force row level security;

-- Readable by anyone who may read the workspace, INCLUDING an API key -- this is the data an API
-- key exists to fetch.
create policy envelope_rows_select on public.envelope_rows
  for select to authenticated
  using (app.can_read_workspace(workspace_id));

-- There is deliberately NO insert, update or delete policy for `authenticated`, and no grant.
-- Decision 1 in the header: derived platform data is not user input. A tenant who could write here
-- could fabricate the numbers the guarantee rests on, and a stolen API key could do it silently.
grant select on public.envelope_rows to authenticated;

-- The ingest role reaches the table only through the SECURITY DEFINER function above, so it needs
-- no table grant at all. Stated rather than assumed: the absence is the design.
