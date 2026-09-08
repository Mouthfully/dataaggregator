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

create type app.entity_type as enum (
  'account', 'campaign', 'ad_group', 'ad', 'keyword', 'search_term',
  'url', 'geo', 'property', 'page', 'query'
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
  constraint envelope_rows_converted_needs_rate check (
    fx_source is null
    or (spend is null and conversions_value is null and revenue is null)
    or fx_rate is not null
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
    fetched_at, source_updated_at, restates_until, is_provisional, first_seen_at,
    fx_source, fx_rate_date, fx_rate, fx_base, raw_key
  ) values (
    p_workspace_id, p_connection_id, p_source, p_account_id, p_entity_id, p_entity_type,
    p_native_entity_type, p_native_id, p_entity_name, p_parent_id,
    p_date, p_currency, p_timezone, p_attribution_window,
    p_spend, p_impressions, p_clicks, p_sessions, p_conversions, p_conversions_value, p_revenue,
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
  text, date, numeric, text, text
) from public, anon, authenticated;

grant execute on function app.upsert_envelope_row(
  uuid, uuid, app.envelope_source, text, text, app.entity_type, text, text, date, text, text,
  app.attribution_window, timestamptz, timestamptz, timestamptz, timestamptz, text, text,
  numeric, numeric, numeric, numeric, numeric, numeric, numeric,
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
