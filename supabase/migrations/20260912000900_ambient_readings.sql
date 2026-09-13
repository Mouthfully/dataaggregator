-- AMBIENT CONTEXT: PUBLIC FACTS ABOUT THE WORLD, STORED ONCE.
--
-- ============================================================================================
-- READ THIS BEFORE YOU FILE A BUG ABOUT THE MISSING workspace_id.
-- ============================================================================================
--
-- `public.ambient_readings` has NO `workspace_id`, NO `connection_id` and NO tenant predicate in
-- its select policy. Every other data table in this schema has all three, so the absence looks
-- exactly like the defect this repository's RLS suite exists to catch. It is not one, and the
-- reason is worth stating precisely rather than asserting.
--
-- Specification section 15 forbids cross-workspace reads and "no cross-workspace aggregation
-- ever". That rule protects TENANT PLATFORM DATA: a row that exists because a customer authorised
-- us to pull it from their ad account, their store or their property. Its subject is the tenant;
-- its custody is the whole product.
--
-- The PM2.5 concentration measured at a Pollution Control Department monitoring station in Bangkok
-- at 14:00 is not that. Nobody's `external_account_id` owns it. It was published, unauthenticated,
-- to the entire internet by a Thai government agency before this database existed, and it will
-- still be published if every workspace here is deleted tonight. There is no tenant whose data it
-- is, so there is no tenant boundary to breach -- and duplicating one identical row per workspace
-- would not add a guarantee, it would add 174 stations x 6 parameters x 24 hours of drift between
-- copies that must agree and have no mechanism forcing them to.
--
-- WHAT IS TENANT-SCOPED IS THE SUBSCRIPTION, and that is a separate table, below, with row-level
-- security and the usual four policies. "Which workspace asked us to watch Chiang Mai" IS a fact
-- about a customer -- it discloses where they operate and what they are worried about -- and it is
-- protected exactly like every other tenant row. The split is the design:
--
--     ambient_readings       public fact     shared, readable by any authenticated session
--     ambient_subscriptions  tenant fact     RLS, one workspace, four policies
--
-- ============================================================================================
-- WHY THESE ROWS ARE NOT `envelope_rows`, WHICH IS WHERE THEY WOULD OTHERWISE GO.
-- ============================================================================================
--
-- `packages/contract/src/envelope.ts` is built for PER-ACCOUNT MARKETING AND COMMERCE rows, and
-- two of its load-bearing parts refuse ambient data outright rather than merely fitting it badly:
--
--   THE UPSERT KEY is `(source, account_id, entity_id, date, attribution_window)`. An air quality
--   reading has no account, no entity, no attribution window, and its grain is an HOUR rather than
--   a calendar date. Forcing it in means inventing an account id, inventing an entity id and
--   labelling an attribution window on a number that was never attributed to anything -- three
--   fabrications on the one key the store's identity rests on.
--
--   THE ATTRIBUTION REFUSAL (`envelopeRowSchema`, section 2: "the API refuses to emit an
--   unlabelled conversion count") is the product's headline guarantee. Feeding it rows where the
--   window is a placeholder teaches every future reader that the label is decorative.
--
-- And `SOURCES` in `packages/contract/src/source.ts` is the vocabulary `scripts/check-dictionary.mjs`
-- keeps identical on both sides of the wire. `air4thai` is deliberately NOT added to it: a source
-- in that enum is a source the envelope can carry a row from, and this one cannot. The dictionary
-- stays the marketing/commerce dictionary; ambient data gets its own small vocabulary, here.
--
-- ============================================================================================
-- NO CONNECTION, NO CREDENTIAL LANE, AND THAT IS NOT AN OVERSIGHT.
-- ============================================================================================
--
-- Air4Thai is an unauthenticated public GET. There is no token, no key, no secret and no
-- authorisation server. So this migration adds NOTHING to `app.connection_provider` and NOTHING to
-- `app.credential_lane`, and `packages/connections` is untouched. Four reasons, because "we did
-- not need it" is the kind of sentence that gets reversed by the next person in a hurry:
--
--   1. `public.connections` requires `credential_ciphertext`, `credential_iv` and `wrapped_dek`
--      NOT NULL. There is no secret to seal. A row of placeholder bytes would be a fiction in the
--      one table whose entire purpose is custody of real secrets.
--   2. `PROVIDER_LANES` answers "which lanes may a customer walk down to connect this provider".
--      For a public dataset the answer is not a lane called `none`; it is that the question does
--      not apply. An empty lane list is an unconnectable provider, which is worse than no entry.
--   3. `isSelfIssued(lane)` in packages/connections is `lane !== "oauth"`. A `none` lane would
--      answer TRUE to "did the customer mint this itself", and `connectionHealth` would then tell
--      somebody "Connected. This key does not expire" about a credential that does not exist.
--   4. A connection is `unique (workspace_id, provider, external_account_id)`. There is no
--      external account. The per-workspace fact here is the subscription, and it has its own table
--      with its own key.
--
-- `scripts/check-providers.mjs` therefore passes in both directions BECAUSE nothing was added to
-- either side, not because an addition was matched. `supabase/tests/14_ambient.sql` asserts both
-- absences so this paragraph cannot quietly become false.

-- ---------------------------------------------------------------------------------------------
-- Vocabulary
-- ---------------------------------------------------------------------------------------------

-- One member today. An enum rather than free text because the ingest path is the only writer and
-- a typo'd source string is a row that joins to nothing and is never noticed -- readings are not
-- read back by the connector that wrote them.
create type app.ambient_source as enum ('air4thai');

-- The parameters Air4Thai reports. Lower-cased and separator-free because the platform's own
-- spelling ("PM25", "PM2.5", "pm2_5") differs between its endpoints and its documentation, and a
-- canonical form is the entire point of having a vocabulary.
--
-- `aqi` IS A MEMBER AND IT IS NOT A MEASUREMENT. Air4Thai publishes the Thai AQI alongside the
-- concentrations, computed by the agency from a band table this repository does not implement.
-- Storing it is honest -- it is what the agency published -- and recomputing it here would be a
-- second opinion presented as a reading. Its `unit` is 'aqi', which is how a consumer tells it
-- apart from a concentration without a lookup.
create type app.ambient_parameter as enum ('pm25', 'pm10', 'o3', 'co', 'no2', 'so2', 'aqi');

-- ---------------------------------------------------------------------------------------------
-- The shared readings table
-- ---------------------------------------------------------------------------------------------

create table public.ambient_readings (
  source       app.ambient_source not null,

  -- The publisher's own station identifier, e.g. '03t'. Not a uuid of ours: re-keying a public
  -- dataset means every re-fetch has to resolve a mapping table before it can tell whether it has
  -- seen a row, which is exactly the lookup the natural key removes.
  station_id   text not null check (length(station_id) between 1 and 64),

  -- AN INSTANT, NOT A LOCAL CLOCK READING. Air4Thai publishes `date` and `time` in Thai local time
  -- with no offset anywhere in the payload. The offset is applied by the normaliser
  -- (`air4ThaiObservedAt` in packages/connectors) and this column stores the resulting instant.
  -- Storing the naive pair would make every cross-source comparison seven hours wrong, silently,
  -- and only in the direction that looks plausible.
  observed_at  timestamptz not null,

  parameter    app.ambient_parameter not null,

  -- NOT NULL, AND ABSENCE IS NEVER A ROW. Air4Thai reports a missing reading as the sentinel
  -- "-1" (a station offline, an instrument in calibration). A sentinel written to this column
  -- would average into every downstream mean as a real negative concentration. The normaliser
  -- drops those; a parameter with nothing to report simply has no row for that hour.
  value        numeric not null,

  -- Carried per row rather than derived from `parameter`, because the publisher's unit is the
  -- publisher's to change and a unit inferred from a lookup we wrote is a number relabelled by us.
  unit         text not null check (unit in ('ug/m3', 'ppb', 'ppm', 'aqi')),

  -- When WE pulled it. The reading's own clock is `observed_at`; these are different questions and
  -- the envelope's four-clock note (packages/contract/src/envelope.ts) is about exactly this
  -- confusion.
  fetched_at   timestamptz not null,

  -- Immutable insert-time anchor, never rewritten by a re-fetch. Added rather than inherited from
  -- the envelope: without it there is no way to tell a value the agency has since revised from one
  -- we only just started collecting, and the re-fetch below would erase the distinction.
  first_seen_at timestamptz not null default now(),

  -- THE IDEMPOTENCY KEY. The source publishes hourly and the scheduler will overlap windows on
  -- purpose (a pull that straddles the publication is better than one that races it), so the same
  -- hour arrives repeatedly. These four columns are what makes a re-fetch a no-op instead of a
  -- duplicate: one value, per parameter, per station, per instant, per source.
  primary key (source, station_id, observed_at, parameter)
);

-- "The latest readings for this source", which is the only query the product has today and the one
-- the primary key cannot serve: its leading column after `source` is the station.
create index ambient_readings_recent_idx
  on public.ambient_readings (source, observed_at desc);

comment on table public.ambient_readings is
  'PUBLIC ambient measurements, shared across every workspace and deliberately carrying no '
  'workspace_id. See the header of 20260912000900_ambient_readings.sql: an air quality reading '
  'published by a government agency was never any tenant''s data, so section 15''s no-cross-'
  'workspace-read rule has no subject here. The tenant-scoped table is ambient_subscriptions.';

comment on column public.ambient_readings.observed_at is
  'The instant of the measurement. Air4Thai publishes Thai local time with no offset; the '
  'normaliser applies it. A naive local timestamp here is seven hours of silent error.';

-- ---------------------------------------------------------------------------------------------
-- The tenant-scoped subscription table
-- ---------------------------------------------------------------------------------------------
--
-- What a workspace has ASKED FOR. This is the row that decides whether the scheduler pulls a
-- source at all and what a dashboard shows, and it is a fact about a customer: which stations a
-- business watches says where it operates and what it is worried about. So it is workspace-scoped,
-- RLS-enforced and anon-revoked exactly like `connections`.

create table public.ambient_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  source       app.ambient_source not null,

  -- NULL MEANS EVERY STATION OF THIS SOURCE, not "unknown". A workspace watching Thailand as a
  -- whole is a real subscription and not a degenerate one; spelling it as 174 rows would make
  -- "unsubscribe from the source" a 174-row delete that can half-fail.
  station_id   text check (station_id is null or length(station_id) between 1 and 64),

  -- The customer's own name for it, e.g. "the warehouse". Never used as a key.
  label        text,

  -- Disabled rather than deleted, so "we stopped pulling on the 3rd" survives. A disabled
  -- subscription is not a subscription for any purpose except the audit trail.
  disabled_at  timestamptz,

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- TWO PARTIAL UNIQUE INDEXES RATHER THAN ONE CONSTRAINT, because PostgreSQL treats NULLs as
-- distinct in a unique index: `unique (workspace_id, source, station_id)` would let a workspace
-- subscribe to "every station" an unbounded number of times. `nulls not distinct` (PG15+) would
-- also work and is left alone deliberately -- these two say which case is which at the point of
-- reading, and the whole-source case is the one worth naming.
create unique index ambient_subscriptions_station_key
  on public.ambient_subscriptions (workspace_id, source, station_id)
  where station_id is not null;

create unique index ambient_subscriptions_source_key
  on public.ambient_subscriptions (workspace_id, source)
  where station_id is null;

create index ambient_subscriptions_active_idx
  on public.ambient_subscriptions (source) where disabled_at is null;

comment on table public.ambient_subscriptions is
  'Which workspace has enabled which ambient source, and optionally which station. THIS is the '
  'tenant-scoped half of ambient data; the readings themselves are public and shared.';

-- ---------------------------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------------------------

alter table public.ambient_readings       enable row level security;
alter table public.ambient_readings       force  row level security;
alter table public.ambient_subscriptions  enable row level security;
alter table public.ambient_subscriptions  force  row level security;

-- ============================================================================================
-- THE DECISION THE BRIEF ASKS FOR: READS ARE **NOT** GATED ON HOLDING A SUBSCRIPTION.
-- ============================================================================================
--
-- The alternative was a policy reading
--
--     using (exists (select 1 from public.ambient_subscriptions s
--                     where s.source = ambient_readings.source
--                       and app.can_read_workspace(s.workspace_id)))
--
-- and it is rejected for three reasons, in increasing order of how much they matter:
--
--   1. IT PROTECTS NOTHING. The same numbers are served, unauthenticated, by
--      air4thai.pcd.go.th to anyone with curl. A predicate that withholds from a paying
--      authenticated customer what a stranger can fetch in one request is not a control, it is an
--      inconvenience with the shape of one.
--
--   2. IT WOULD BE MISTAKEN FOR A TENANT BOUNDARY, and that is the real cost. A reader who finds
--      a subscription join in a select policy will reasonably conclude the table holds tenant
--      data -- and will then write the next feature, the next export, the next cache, as though
--      leaking a row across workspaces were a breach. A predicate that RESEMBLES isolation while
--      protecting a public fact teaches the wrong model of the whole schema. The honest statement
--      is `using (true)` with this comment attached to it.
--
--   3. IT WOULD BE A SUBSCRIPTION CHECK IN THE WRONG LAYER. What a subscription actually governs
--      is what we SPEND EFFORT ON: which sources the scheduler pulls, which stations the
--      dashboard shows, what a workspace is billed for. None of those are legibility questions,
--      and enforcing them in RLS means a product decision can only be changed by a migration.
--
-- WHAT MAKES THIS SOUND, and the test that any future ambient table must pass before it may
-- borrow this exemption: NO COLUMN OF `ambient_readings` REFERENCES A WORKSPACE, A CONNECTION, A
-- MEMBER OR AN EXTERNAL ACCOUNT. There is nothing in a row that could identify a tenant, so an
-- ungated read discloses nothing about one. The moment a column would fail that test -- a
-- `requested_by`, a `first_requested_by_workspace_id`, anything that records who wanted it -- this
-- table stops being public data and the exemption stops applying.
--
-- `supabase/tests/14_ambient.sql` asserts the absence of any workspace-referencing column, so the
-- condition this exemption rests on is checked rather than remembered.
create policy ambient_readings_select on public.ambient_readings
  for select to authenticated
  using (true);

-- NO insert, update or delete policy, and no write grant. With FORCE RLS that denies every write
-- from every tenant role outright. The ingest path is the SECURITY DEFINER function below, which
-- only `app_ingest` may execute -- the same three-deep arrangement `envelope_rows` uses, and for
-- the same reason: a tenant able to write these rows could fabricate the context a diagnosis is
-- later explained with.

create policy ambient_subscriptions_select on public.ambient_subscriptions
  for select to authenticated
  using (app.can_read_workspace(workspace_id));

create policy ambient_subscriptions_insert on public.ambient_subscriptions
  for insert to authenticated
  with check (app.can_write_workspace(workspace_id));

-- THE `with check` IS WRITTEN OUT AND IT CHANGES NOTHING TODAY. Stated plainly because the first
-- draft of this comment claimed the opposite -- that without it an analyst could re-point their
-- own subscription at another workspace -- and a mutation test proved that claim false:
-- PostgreSQL uses the USING expression as the WITH CHECK when none is given, so deleting the line
-- left every assertion green.
--
-- It stays because the two questions are only accidentally the same. USING asks "may you touch
-- this row"; WITH CHECK asks "may the row you are producing exist". The day one of them grows a
-- condition the other should not have -- `disabled_at is null` on the visible side, say -- the
-- implicit copy would silently apply it to both. Writing both makes that a decision instead of a
-- side effect.
create policy ambient_subscriptions_update on public.ambient_subscriptions
  for update to authenticated
  using (app.can_write_workspace(workspace_id))
  with check (app.can_write_workspace(workspace_id));

create policy ambient_subscriptions_delete on public.ambient_subscriptions
  for delete to authenticated
  using (app.can_write_workspace(workspace_id));

-- ---------------------------------------------------------------------------------------------
-- Grants
--
-- REVOKE FIRST, THEN GRANT, AND THE ORDER IS THE WHOLE POINT.
--
-- 20260911000100_anon_has_nothing.sql changed the default privileges for `anon` and stopped
-- there, deliberately: "authenticated keeps exactly what 0700, 1100 and 1200 granted it". What it
-- did NOT change is the OTHER half of Supabase's shipped default -- `alter default privileges in
-- schema public grant all on tables to anon, authenticated, service_role` -- so on a hosted
-- project every table created by a later migration arrives with FULL DML for `authenticated`,
-- including this one.
--
-- FOUND BY THE TEST, NOT BY READING. `supabase/tests/14_ambient.sql` asserts that `authenticated`
-- holds no INSERT on the shared readings, and on the first run it did: `ambient_readings` was
-- created with insert, update, delete and truncate for every logged-in customer on the platform.
-- Row-level security is why that would not have been a leak -- there is no write policy, and FORCE
-- RLS denies the command -- and it is not why it would not have been a problem. The repository's
-- posture is grant-revocation AND row-level security, and a table with one layer where every other
-- has two is one `create policy ... for insert` away from mattering.
--
-- So both tables are stripped to nothing and then given back exactly what they need. That is also
-- why the readings grant reads `select` alone rather than trusting the absence of a write policy.
revoke all on public.ambient_readings from public, anon, authenticated;
grant select on public.ambient_readings to authenticated;

revoke all on public.ambient_subscriptions from public, anon, authenticated;
grant select, insert, update, delete on public.ambient_subscriptions to authenticated;

-- ---------------------------------------------------------------------------------------------
-- The write path
-- ---------------------------------------------------------------------------------------------
--
-- SECURITY DEFINER, in schema `app`, for the reason `app.upsert_envelope_row` is: the writer is
-- `app_ingest`, which holds no grant on the table and must not have one. The privilege is the
-- function, not the role.
--
-- NO `public.` WRAPPER IS ADDED HERE, DELIBERATELY. PostgREST only exposes `public`, so a Worker
-- calling this over RPC needs one -- and `envelope_rows` shipped the same way, with its wrapper
-- arriving four migrations later in 20260912000300_ingest_entry_point.sql. That migration also had
-- to amend `supabase/tests/07_anon_grants.sql`, whose enumeration of the anon-executable surface
-- fails on any new `public` function that is not accounted for. Adding the wrapper here without
-- that amendment would either fail the suite or, worse, pass it by being added to the exception
-- list without the narrow grant that justifies the exception. It is a separate migration with a
-- separate test, and this comment is the handoff.
create or replace function app.upsert_ambient_reading(
  p_source       app.ambient_source,
  p_station_id   text,
  p_observed_at  timestamptz,
  p_parameter    app.ambient_parameter,
  p_value        numeric,
  p_unit         text,
  p_fetched_at   timestamptz
)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  insert into public.ambient_readings
    (source, station_id, observed_at, parameter, value, unit, fetched_at)
  values
    (p_source, p_station_id, p_observed_at, p_parameter, p_value, p_unit, p_fetched_at)
  on conflict (source, station_id, observed_at, parameter) do update
     set value      = excluded.value,
         unit       = excluded.unit,
         fetched_at = excluded.fetched_at;
  -- `first_seen_at` IS ABSENT FROM THE UPDATE LIST ON PURPOSE. It is the immutable anchor: a
  -- re-fetch that moved it would erase the one piece of evidence that distinguishes a value the
  -- agency has since revised from one we only started collecting this morning.
$$;

-- PostgreSQL grants EXECUTE on a new function to PUBLIC, and `anon` is a member of PUBLIC.
-- `alter default privileges` cannot revoke that (established by 20260911000200), so it is revoked
-- here by hand or the internet can write ambient readings.
revoke all on function app.upsert_ambient_reading(
  app.ambient_source, text, timestamptz, app.ambient_parameter, numeric, text, timestamptz
) from public, anon, authenticated;

grant execute on function app.upsert_ambient_reading(
  app.ambient_source, text, timestamptz, app.ambient_parameter, numeric, text, timestamptz
) to app_ingest;
