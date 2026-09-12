-- `connections.timezone`, and the four ways a timezone column goes quietly wrong.
--
-- The column itself is one `alter table`. What this suite covers is everything around it, because
-- each failure here is silent rather than loud:
--
--   1. A DEFAULT. 'UTC' would let a seed row that forgot the column succeed, and every date on
--      every row from that store would be off by the store's offset -- seven hours for the launch
--      market, which moves roughly a third of each day onto the wrong calendar date.
--   2. NOT NULL. Every connection predating this column has no value that can be derived, and
--      WordPress's own `timezone_string` is EMPTY on a site using a manual UTC offset. A null has
--      to be sayable, and it has to mean "nobody has told us".
--   3. A MEMBERSHIP TEST THAT IS TOO WIDE. `pg_timezone_names` holds 499 rows on PostgreSQL 16 and
--      sixteen of them are not IANA zone names: `localtime`, `posixrules`, `EST5EDT`, `Factory`.
--      Each passes a bare `exists` and then reaches the customer as `dimensions.timezone`, where
--      `Intl.DateTimeFormat` -- a browser, a spreadsheet, and this repo's own connector -- refuses
--      it.
--   4. CASE. PostgreSQL resolves 'asia/bangkok' happily. IANA does not call it that, and this
--      value is copied onto every envelope row and handed out.
--
-- The refusals are exercised, never read off the trigger body.

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
-- The shape of the column. Nullable, text, and NO default.
-- ---------------------------------------------------------------------------------------------
do $$
declare v_notnull boolean; v_default text; v_type text;
begin
  select a.attnotnull, pg_get_expr(d.adbin, d.adrelid), format_type(a.atttypid, a.atttypmod)
    into v_notnull, v_default, v_type
    from pg_attribute a
    left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
   where a.attrelid = 'public.connections'::regclass
     and a.attname = 'timezone'
     and not a.attisdropped;

  perform app_test.check(
    'public.connections has a timezone column',
    v_type is not null,
    format('timezone is %s', coalesce(v_type, '(absent)'))
  );
  perform app_test.check(
    'timezone is NULLABLE, because a connection nobody has told us about must be sayable',
    not coalesce(v_notnull, true)
  );
  perform app_test.check(
    'timezone has NO default -- a default is a guess wearing the costume of a measurement',
    v_default is null,
    format('timezone defaults to %s', coalesce(v_default, '(none)'))
  );
end $$;

-- ---------------------------------------------------------------------------------------------
-- ADDING A COLUMN TO AN EXISTING TABLE MUST NOT REOPEN IT TO `anon`.
--
-- 20260911000100_anon_has_nothing.sql left `anon` with no grant on any table in `public`, and the
-- shim's comment records that a table created by a LATER migration silently keeps Supabase's
-- default grant. A column is not a table and inherits the table's ACL -- which is the answer this
-- asserts rather than assumes, because the cost of being wrong is the credential metadata of every
-- tenant, readable with a key that ships in browsers.
-- ---------------------------------------------------------------------------------------------
do $$
begin
  perform app_test.check(
    'authenticated can select connections.timezone, with no new grant',
    has_column_privilege('authenticated', 'public.connections', 'timezone', 'SELECT')
  );
  perform app_test.check(
    'anon cannot select connections.timezone',
    not has_column_privilege('anon', 'public.connections', 'timezone', 'SELECT')
  );
end $$;

-- ---------------------------------------------------------------------------------------------
-- What lands and what is refused.
--
-- THE VERDICTS ARE COMPUTED INSIDE A DOOMED SUBTRANSACTION AND RECORDED AFTER IT, for the reason
-- 08_credential_lane.sql gives: `app_test.check()` records by INSERTING, so a block that rolls
-- back discards its own evidence and the summary counts what survived. PL/pgSQL variables are
-- memory and outlive the rollback; the fixture does not.
--
-- `v_reached` is set LAST. If any statement above it raised, every verdict in this block is known
-- to be void rather than quietly counted as a pass.
-- ---------------------------------------------------------------------------------------------
do $$
declare
  v_reached      boolean := false;
  v_bangkok      boolean;
  v_utc          boolean;
  v_null         boolean;
  v_read_back    text;
  v_distinct     boolean;
  v_refused      text[] := '{}';
  v_accepted     text[] := '{}';
  v_update_bad   boolean := false;
  v_update_good  boolean := false;
  v_candidate    text;
begin
  begin
    insert into auth.users (id, email) values
      ('e0000000-0000-4000-8000-000000000001', 'tz@test.test') on conflict do nothing;
    insert into public.organisations (id, name, slug) values
      ('e1000000-0000-4000-8000-000000000001', 'TZ Org', 'tz-org') on conflict do nothing;
    insert into public.workspaces (id, organisation_id, name, slug) values
      ('e2000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000001',
       'TZ Workspace', 'tz-workspace') on conflict do nothing;

    insert into public.connections
      (id, workspace_id, provider, credential_lane, external_account_id,
       credential_ciphertext, credential_iv, wrapped_dek, timezone)
    values
      ('e3000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000001',
       'woocommerce', 'key_secret', 'https://shop.example.com', '\x00', '\x00', '\x00',
       'Asia/Bangkok');
    v_bangkok := true;

    insert into public.connections
      (id, workspace_id, provider, credential_lane, external_account_id,
       credential_ciphertext, credential_iv, wrapped_dek, timezone)
    values
      ('e3000000-0000-4000-8000-000000000002', 'e2000000-0000-4000-8000-000000000001',
       'woocommerce', 'key_secret', 'https://utc.example.com', '\x00', '\x00', '\x00', 'UTC');
    v_utc := true;

    -- Null is the shape of "nobody has told us", and the backfill refuses to run against it. It
    -- must therefore be writable, or a connection could not exist before someone asks the merchant.
    insert into public.connections
      (id, workspace_id, provider, credential_lane, external_account_id,
       credential_ciphertext, credential_iv, wrapped_dek, timezone)
    values
      ('e3000000-0000-4000-8000-000000000003', 'e2000000-0000-4000-8000-000000000001',
       'woocommerce', 'key_secret', 'https://unknown.example.com', '\x00', '\x00', '\x00', null);
    v_null := true;

    -- THE KEYWORD CHECK, and it is here because 20260912000200_position.sql records exactly this
    -- class of surprise: `max(position)` parses as `POSITION(x IN y)` and is a syntax error, found
    -- by the suite rather than by the keyword list consulted beforehand. `timezone` is a function
    -- name too, so the bare column is read in a select list and in `is distinct from` rather than
    -- assumed to work.
    select timezone into v_read_back
      from public.connections where id = 'e3000000-0000-4000-8000-000000000001';
    select timezone is distinct from 'UTC' into v_distinct
      from public.connections where id = 'e3000000-0000-4000-8000-000000000001';

    -- EVERY REFUSAL, ONE LOOP. Four of these are members of `pg_timezone_names`, which is the
    -- whole reason the trigger is not a bare `exists`.
    foreach v_candidate in array array[
      '',              -- the empty string, which is what a seed script writes when a form was blank
      'Asia/Bangkokk', -- a typo
      'asia/bangkok',  -- the right zone, not the name IANA gives it
      'localtime',     -- in pg_timezone_names; Intl.DateTimeFormat refuses it
      'posixrules',    -- in pg_timezone_names; not a place
      'EST5EDT',       -- in pg_timezone_names; a POSIX rule string, not an Area/Location
      'Factory',       -- in pg_timezone_names; a placeholder meaning "unconfigured"
      'UTC+7'          -- what WordPress stores when a site uses a manual offset
    ] loop
      begin
        insert into public.connections
          (id, workspace_id, provider, credential_lane, external_account_id,
           credential_ciphertext, credential_iv, wrapped_dek, timezone)
        values
          (gen_random_uuid(), 'e2000000-0000-4000-8000-000000000001',
           'woocommerce', 'key_secret', format('https://%s.example.com', md5(v_candidate)),
           '\x00', '\x00', '\x00', v_candidate);
        v_accepted := v_accepted || v_candidate;
      exception when others then
        v_refused := v_refused || v_candidate;
      end;
    end loop;

    -- AN UPDATE, NOT ONLY AN INSERT. `before insert or update of timezone` is two events and a
    -- trigger declared on one of them passes every insert test while leaving the column writable
    -- to anything afterwards -- which is the shape a real mistake takes, since a seed script
    -- inserts once and a correction updates.
    --
    -- BOTH RUN AGAINST THE ROW WHOSE ZONE IS STILL NULL, because setting a null zone is the only
    -- update this column now permits at all -- see the immutability block below. Using the
    -- Asia/Bangkok row would assert the immutability rule twice and the IANA rule never.
    begin
      update public.connections set timezone = 'Mars/Olympus'
       where id = 'e3000000-0000-4000-8000-000000000003';
    exception when others then
      v_update_bad := true;
    end;

    update public.connections set timezone = 'Europe/Berlin'
     where id = 'e3000000-0000-4000-8000-000000000003';
    v_update_good := true;

    v_reached := true;
    raise exception 'discarding the fixture';
  exception
    when others then null;
  end;

  perform app_test.check(
    'the fixture block ran to completion, so the verdicts below mean something',
    v_reached,
    'an earlier statement raised; every timezone verdict in this block is void'
  );

  perform app_test.check('a real IANA zone lands', coalesce(v_bangkok, false));
  perform app_test.check('UTC lands, being the one valid name with no slash', coalesce(v_utc, false));
  perform app_test.check('a null lands, and means nobody has told us', coalesce(v_null, false));
  perform app_test.check(
    'the stored name is returned verbatim, and a bare `timezone` reads as a column',
    v_read_back = 'Asia/Bangkok',
    format('read back %s', coalesce(quote_literal(v_read_back), 'NULL'))
  );
  perform app_test.check(
    '`timezone is distinct from` parses as a column comparison',
    coalesce(v_distinct, false)
  );
  perform app_test.check(
    'every non-IANA value is refused, including the four pg_timezone_names carries',
    cardinality(v_accepted) = 0,
    format('accepted %s', v_accepted::text)
  );
  perform app_test.check(
    'an UPDATE to an unknown zone is refused, not only an INSERT',
    v_update_bad
  );
  perform app_test.check(
    'an UPDATE that SETS a zone for the first time still lands',
    v_update_good
  );
end $$;

-- ---------------------------------------------------------------------------------------------
-- IMMUTABLE ONCE SET.
--
-- The sharpest assertion in this file, and it exists because of a review finding rather than
-- because anyone thought of it first. `date` on an envelope row is now computed in this zone and
-- `date` is part of the upsert key, so changing the zone makes a re-pull of an order near midnight
-- write a SECOND row instead of updating the first -- and the customer's total goes silently UP.
--
-- Every path is exercised: null -> a zone (allowed, it is how one gets set), a zone -> the same
-- zone (allowed, a no-op update must not fail), a zone -> a different zone (refused), and a zone
-- -> null (refused, because otherwise it is a two-step version of the same change).
-- ---------------------------------------------------------------------------------------------
do $$
declare
  v_reached     boolean := false;
  v_set_first   boolean := false;
  v_same        boolean := false;
  v_changed     boolean := false;
  v_to_null     boolean := false;
  v_untouched   text;
begin
  begin
    insert into auth.users (id, email) values
      ('e0000000-0000-4000-8000-000000000002', 'tz2@test.test') on conflict do nothing;
    insert into public.organisations (id, name, slug) values
      ('e1000000-0000-4000-8000-000000000002', 'TZ Org 2', 'tz-org-2') on conflict do nothing;
    insert into public.workspaces (id, organisation_id, name, slug) values
      ('e2000000-0000-4000-8000-000000000002', 'e1000000-0000-4000-8000-000000000002',
       'TZ Workspace 2', 'tz-workspace-2') on conflict do nothing;

    -- Starts with NO zone, which is what a connection looks like before anyone is asked.
    insert into public.connections
      (id, workspace_id, provider, credential_lane, external_account_id,
       credential_ciphertext, credential_iv, wrapped_dek, timezone)
    values
      ('e4000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000002',
       'woocommerce', 'key_secret', 'https://immutable.example.com', '\x00', '\x00', '\x00', null);

    -- null -> a zone. THE SETTING PATH, and it must stay open or a connection could never be used.
    update public.connections set timezone = 'Asia/Bangkok'
     where id = 'e4000000-0000-4000-8000-000000000001';
    v_set_first := true;

    -- the same zone. A no-op update that raised would break every unrelated write to this table.
    update public.connections set timezone = 'Asia/Bangkok'
     where id = 'e4000000-0000-4000-8000-000000000001';
    v_same := true;

    -- a DIFFERENT zone. The one that forks the rows.
    begin
      update public.connections set timezone = 'America/New_York'
       where id = 'e4000000-0000-4000-8000-000000000001';
    exception when others then v_changed := true;
    end;

    -- back to null. Refused too, or it is `Asia/Bangkok -> null -> America/New_York` in two steps.
    begin
      update public.connections set timezone = null
       where id = 'e4000000-0000-4000-8000-000000000001';
    exception when others then v_to_null := true;
    end;

    select timezone into v_untouched from public.connections
     where id = 'e4000000-0000-4000-8000-000000000001';

    v_reached := true;
    raise exception 'discarding the fixture';
  exception
    when others then null;
  end;

  perform app_test.check(
    'the immutability block ran to completion, so the verdicts below mean something',
    v_reached,
    'an earlier statement raised; every immutability verdict in this block is void'
  );
  perform app_test.check('a null zone can be SET for the first time', v_set_first);
  perform app_test.check('setting the same zone again is not an error', v_same);
  perform app_test.check(
    'changing a set zone is REFUSED, because it forks every keyed row', v_changed);
  perform app_test.check(
    'clearing a set zone is refused too, or the change is just two steps long', v_to_null);
  perform app_test.check(
    'the refused updates left the stored zone untouched',
    v_untouched = 'Asia/Bangkok',
    format('the zone is now %s', coalesce(quote_literal(v_untouched), 'NULL'))
  );
end $$;

-- ---------------------------------------------------------------------------------------------
-- The fixture left nothing behind. A suite whose rollback silently failed would hand every
-- assertion above to the next reader as state rather than as evidence.
-- ---------------------------------------------------------------------------------------------
do $$
declare v_left integer;
begin
  select count(*) into v_left from public.connections
   where workspace_id in ('e2000000-0000-4000-8000-000000000001',
                          'e2000000-0000-4000-8000-000000000002');
  perform app_test.check(
    'the fixture rolled back and left no connection row', v_left = 0,
    format('%s row(s) survived', v_left)
  );
end $$;

-- ---------------------------------------------------------------------------------------------
-- Summary. The floor is asserted for the reason given in 06_jwt_claims.sql: a suite that stops
-- running looks exactly like a suite that passes.
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
  if v_failed > 0 then raise exception 'connection timezone: % assertion(s) failed', v_failed; end if;
  if v_total < 20 then
    raise exception 'connection timezone: only % assertion(s) ran; expected at least 20', v_total;
  end if;
end $$;
