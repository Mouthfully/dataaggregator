-- THE TIMEZONE IS IMMUTABLE ONCE SET.
--
-- A SEPARATE MIGRATION AND NOT AN EDIT TO 20260912000400, AND THE REASON IS THE POINT. That file
-- has already been applied to the live `numbadee` project. An applied migration is immutable: a
-- project that ran the original and a project that runs an edited copy would disagree about what
-- version 20260912000400 means, and the disagreement is invisible -- `supabase_migrations` records
-- the version, never the body. So the amendment is a new version, which is also the honest history:
-- the column shipped, a review found a hazard, this closed it.
--
-- WHAT THE HAZARD IS. The envelope upsert key is
-- `(workspace_id, source, account_id, entity_id, date, attribution_window)`.
-- 20260912000400 is what makes `date` DEPEND on this column: `wooGmtToDate` buckets a UTC instant
-- in the store's own zone, so an order placed near midnight lands on a different calendar day under
-- a different zone.
--
-- Change the zone on a connection that has already produced rows and the next re-pull of such an
-- order computes a DIFFERENT key. The upsert therefore INSERTS A SECOND ROW instead of updating the
-- first. The old row is not removed and nothing points at it; both are returned by
-- `/v1/performance`, each carrying `orders = 1` and its share of revenue, and the total is silently
-- too HIGH -- the failure this product sells against, arriving from the opposite direction to the
-- usual one. Orders that are never re-pulled stay on the old date, so the table ends up holding two
-- timezones at once with nothing recording which row is which.
--
-- WHY REFUSE RATHER THAN REBUILD. Correcting a wrong zone properly means deleting every
-- `envelope_rows` row the connection produced and rewinding its watermark to the start of history
-- -- a destructive operation with no caller, no UI and no audit trail. Inventing one speculatively
-- is worse than refusing the update and saying what it would take. `envelope_rows` holds zero rows
-- on every project today, so this costs nothing now and closes the hazard before there is data to
-- damage.
--
-- A CHANGE TO NULL IS REFUSED TOO, and that is not pedantry: allowing it would make
-- `Asia/Bangkok -> null -> America/New_York` a two-step version of the update this refuses.

create or replace function app.connections_timezone_is_iana()
returns trigger
language plpgsql
stable
set search_path = public, pg_catalog, pg_temp
as $fn$
begin
  -- THE NEW RULE. Everything below it is 20260912000400's body, unchanged.
  if tg_op = 'UPDATE'
     and old.timezone is not null
     and new.timezone is distinct from old.timezone then
    raise exception
      'connections.timezone is already %, and changing it to % would fork every order this '
      'connection has already written. The envelope upsert key contains `date`, and `date` is '
      'computed in this zone -- so a re-pull of an order near midnight writes a SECOND row instead '
      'of updating the first, and the total goes silently up. Correcting it means re-keying every '
      'row this connection produced, which nothing here can do yet. Delete the connection''s '
      'envelope rows and re-ingest, or set the zone correctly before the first run.',
      quote_literal(old.timezone), coalesce(quote_literal(new.timezone), 'null');
  end if;

  if new.timezone is null then
    return new;
  end if;

  if new.timezone <> 'UTC' and position('/' in new.timezone) = 0 then
    raise exception
      'connections.timezone is %, which is not an IANA Area/Location zone name. PostgreSQL also '
      'accepts legacy aliases such as localtime, posixrules and EST5EDT; this value is copied onto '
      'every envelope row and handed to the customer, where those are not resolvable. Use a name '
      'like Asia/Bangkok, or UTC.',
      quote_literal(new.timezone);
  end if;

  if not exists (select 1 from pg_timezone_names tz where tz.name = new.timezone) then
    raise exception
      'connections.timezone is %, which this server''s timezone database does not know. The match '
      'is exact: pg_timezone_names holds the canonical spelling, and a value that differs only in '
      'case is not the name the IANA database uses. Every date on every row from this connection '
      'would be labelled with it.',
      quote_literal(new.timezone);
  end if;

  return new;
end;
$fn$;

-- THE `when` CLAUSE HAS TO GO, which is why the trigger is recreated and not left alone.
--
-- `when (new.timezone is not null)` was right while the only job was validating a VALUE, and it is
-- wrong now that the trigger also refuses a CHANGE: an update setting the column back to null is
-- exactly one of the paths that must not be taken, and the guard would have skipped it silently.
-- `update of timezone` still keeps this off every write that does not mention the column.
drop trigger if exists connections_timezone_is_iana on public.connections;

create trigger connections_timezone_is_iana
  before insert or update of timezone on public.connections
  for each row
  execute function app.connections_timezone_is_iana();

comment on column public.connections.timezone is
  'The IANA zone the store reports in, e.g. Asia/Bangkok. Null means nobody has told us, never '
  'UTC-by-default: it labels dimensions.date on every envelope row this connection produces, and a '
  'guess there is indistinguishable from a measurement. Validated by trigger against '
  'pg_timezone_names, Area/Location names and UTC only, and IMMUTABLE once set: the envelope '
  'upsert key contains `date`, which is computed in this zone, so a change forks every affected '
  'order into a second row.';
