-- The store's timezone, as a column, because nothing else can answer for it.
--
-- THE GAP THIS CLOSES. `normalizeWooOrders` REQUIRES an IANA zone and has no default: it throws
-- without one. WooCommerce reports `date_created_gmt` in UTC, so which DAY an order belongs to is
-- a question only the store's own zone can answer -- an order placed at 23:30 Bangkok time on the
-- 9th is `2026-09-09T16:30:00` UTC, and a connector that assumed UTC would file it on the 9th by
-- luck and file 00:30 on the 10th on the 9th as well. Seven hours of every day land on the wrong
-- date, on every row, forever, with `ok: true`.
--
-- And nothing in this schema held one. `probeStore` returns `{storeUrl, totalOrders}`;
-- `connections` recorded the provider, the account, the credential and its health, and not this.
-- So the value had nowhere to live between the merchant telling us and a Worker needing it, which
-- is the definition of a column.
--
-- NULLABLE, AND THE NULL IS NOT A DEFAULT. Every connection that exists predates this column and
-- no value can be derived for one: WordPress's `timezone_string` option is EMPTY on a site
-- configured with a manual UTC offset, which is common, so even asking the store does not always
-- answer. A null therefore means "nobody has told us", the backfill refuses to run against it, and
-- the refusal names the connection. A default of 'UTC' would mean "we know, and it is UTC", which
-- would be a guess wearing the costume of a fact.
--
-- WHY NOT ON `envelope_rows`? It is already there -- `envelope_rows.timezone` is `not null` and
-- carries the label for the row. That column is the OUTPUT. This one is the INPUT the connector
-- reads before it can produce a row at all, and it belongs to the connection because it is a
-- property of the store rather than of a day's numbers.
--
-- `timezone` IS SAFE AS A COLUMN NAME AND THAT WAS CHECKED RATHER THAN ASSUMED.
-- 20260912000200_position.sql records `max(position)` parsing as `POSITION(x IN y)` -- a keyword
-- that works everywhere except the one place it was used. `timezone` is a function name
-- (`timezone(text, timestamptz)`) and not a reserved word: it works bare in a select list, in a
-- `check`, as `new.timezone` in a trigger and in `is distinct from`. Verified on PostgreSQL 16
-- before this file was written, and the suite exercises all four.

alter table public.connections add column timezone text;

-- ---------------------------------------------------------------------------------------------
-- THE VALUE IS VALIDATED, AND A CHECK CONSTRAINT CANNOT DO IT.
--
-- The only authority on whether a string is a timezone is `pg_timezone_names`, and a check
-- constraint may not read a table -- it must be IMMUTABLE, and that view is populated from the
-- server's tz database, which changes when the server does. So this is a trigger.
--
-- TWO CONDITIONS, AND THE SECOND IS THE ONE THAT EARNS ITS KEEP. `pg_timezone_names` carries 499
-- rows on PostgreSQL 16, and SIXTEEN of them have no `/` at all: `localtime`, `Factory`,
-- `posixrules`, `EST5EDT`, `CET`, `GMT`, `UTC` and friends. Fifteen of those sixteen are not
-- `Area/Location` zone names -- they are legacy aliases and POSIX rule strings -- and every one
-- would pass a bare membership test and then travel to the customer as `dimensions.timezone`,
-- where `Intl.DateTimeFormat` (a browser, a spreadsheet, and this repo's own connector) rejects
-- `localtime` and `posixrules` outright. An `Area/Location` name, or exactly `UTC` -- the
-- sixteenth, and the one legitimate slashless name -- is the set both agree on.
--
-- THE MATCH IS EXACT AND THEREFORE CASE-SENSITIVE. `pg_timezone_names` holds the canonical
-- spelling; PostgreSQL will happily interpret 'asia/bangkok' in `at time zone`, and it is not what
-- the IANA database calls that zone. The value here is not only used by PostgreSQL -- it is
-- COPIED ONTO EVERY ENVELOPE ROW and handed to the customer, so it has to be the name the rest of
-- the world uses.
--
-- REFUSED AT THE WRITE, NOT AT THE PULL. The alternative is discovering it at 03:00 from a
-- connector throwing on a value a seed script typed weeks earlier.
-- ---------------------------------------------------------------------------------------------
create or replace function app.connections_timezone_is_iana()
returns trigger
language plpgsql
stable
set search_path = public, pg_catalog, pg_temp
as $fn$
begin
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

create trigger connections_timezone_is_iana
  before insert or update of timezone on public.connections
  for each row
  when (new.timezone is not null)
  execute function app.connections_timezone_is_iana();

comment on column public.connections.timezone is
  'The IANA zone the store reports in, e.g. Asia/Bangkok. Null means nobody has told us, never '
  'UTC-by-default: it labels dimensions.date on every envelope row this connection produces, and a '
  'guess there is indistinguishable from a measurement. Validated by trigger against '
  'pg_timezone_names, Area/Location names and UTC only.';
