-- `position`: the first non-additive column, and the grants a DROP took with it.
--
-- Two things are asserted here that nothing else in the suite can see.
--
-- 1. THE COLUMN'S OWN REFUSAL. `position > 0`, not `>= 0`. A SERP position is a 1-based ordinal,
--    so zero does not exist -- and it is the most misleading value available, because zero reads
--    as BETTER than rank one. A bug that wrote it would present as a site ranking above the top
--    result rather than as an error.
--
-- 2. THE UPSERT'S GRANTS, WHICH ARE NEW EVIDENCE RATHER THAN A REPEAT. 20260912000200 had to DROP
--    and recreate `app.upsert_envelope_row`, because adding a parameter to a function creates an
--    OVERLOAD rather than replacing it. A dropped function takes its ACL with it, and PostgreSQL's
--    built-in default grants EXECUTE on a new function to PUBLIC -- so the recreated function was
--    briefly callable by every role, bypassing row-level security entirely. `03_envelope_store.sql`
--    caught it immediately ("POLICY BYPASS: affected 1 row(s)", three times). These assertions pin
--    the ACL directly, so the next person to change that signature is told which property broke
--    rather than inferring it from a policy test.

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
-- The column exists, is numeric, and refuses zero.
-- ---------------------------------------------------------------------------------------------
select app_test.check('envelope_rows carries a position column',
  exists (select 1 from pg_attribute a
           where a.attrelid = 'public.envelope_rows'::regclass
             and a.attname = 'position' and not a.attisdropped));

do $$
declare v_src text;
begin
  select pg_get_constraintdef(c.oid) into v_src
    from pg_constraint c
   where c.conrelid = 'public.envelope_rows'::regclass
     and pg_get_constraintdef(c.oid) like '%position%';

  perform app_test.check(
    'the position check is > 0, not >= 0',
    v_src like '%> (0)::numeric%',
    format('position constraint is: %s', coalesce(v_src, '(none)'))
  );
end $$;

-- ---------------------------------------------------------------------------------------------
-- position is NOT in the fx constraint, and that absence is deliberate.
--
-- The constraint lists CURRENCY metrics, because a converted amount needs the rate that produced
-- it. A rank is not money. Adding it would make the constraint refuse true rows -- a Search
-- Console row carries a position and never carries an fx rate.
-- ---------------------------------------------------------------------------------------------
do $$
declare v_src text;
begin
  select pg_get_constraintdef(c.oid) into v_src
    from pg_constraint c
   where c.conrelid = 'public.envelope_rows'::regclass
     and c.conname = 'envelope_rows_converted_needs_rate';

  perform app_test.check(
    'position is absent from the fx constraint, because a rank is not money',
    v_src not like '%position%',
    format('fx constraint mentions position: %s', coalesce(v_src, '(none)'))
  );
end $$;

-- ---------------------------------------------------------------------------------------------
-- THE GRANTS. See 2 in the header.
-- ---------------------------------------------------------------------------------------------
do $$
declare
  v_oid oid;
  v_count integer;
begin
  select count(*) into v_count
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'app' and p.proname = 'upsert_envelope_row';

  -- A SECOND OVERLOAD IS THE DEFECT, not a redundancy. An ingest worker calling the old signature
  -- would write every metric except `position`, forever, with nothing failing.
  perform app_test.check(
    'exactly one app.upsert_envelope_row exists, so the drop replaced rather than overloaded',
    v_count = 1,
    format('found %s overloads of app.upsert_envelope_row', v_count)
  );

  select p.oid into v_oid
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'app' and p.proname = 'upsert_envelope_row'
   limit 1;

  perform app_test.check('app_ingest may execute the upsert',
    has_function_privilege('app_ingest', v_oid, 'EXECUTE'));

  perform app_test.check('anon may NOT execute the upsert',
    not has_function_privilege('anon', v_oid, 'EXECUTE'),
    'a dropped function loses its ACL and PostgreSQL grants EXECUTE to PUBLIC by default');

  perform app_test.check('authenticated may NOT execute the upsert',
    not has_function_privilege('authenticated', v_oid, 'EXECUTE'),
    'a tenant able to call this writes envelope rows directly, bypassing row-level security');

  perform app_test.check('the upsert takes p_position',
    exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'app' and p.proname = 'upsert_envelope_row'
               and 'p_position' = any (p.proargnames)));
end $$;

-- ---------------------------------------------------------------------------------------------
-- A round trip: written, restated, and announced.
--
-- The restatement half is the one that could not be seen anywhere else. A metric present in the
-- trigger's `when` but absent from `app.record_restatement` fires PL/pgSQL, builds an empty diff,
-- declines, and the update lands with NO EVENT RECORDED -- silently. So this moves a position and
-- asserts an event carrying the OLD value appears.
-- ---------------------------------------------------------------------------------------------
do $$
declare
  v_reached   boolean := false;
  v_error     text;
  v_stored    numeric;
  v_zero_ok   boolean := false;
  v_events    integer;
  v_before    jsonb;
  v_after_pos numeric;
begin
  begin
    insert into auth.users (id, email) values
      ('a0000000-0000-4000-8000-000000000001', 'pos@test.test') on conflict do nothing;
    insert into public.organisations (id, name, slug) values
      ('a1000000-0000-4000-8000-000000000001', 'Pos Org', 'pos-org') on conflict do nothing;
    insert into public.workspaces (id, organisation_id, name, slug) values
      ('a2000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001',
       'Pos Workspace', 'pos-workspace') on conflict do nothing;

    perform app.upsert_envelope_row(
      p_workspace_id       => 'a2000000-0000-4000-8000-000000000001',
      p_connection_id      => null,
      p_source             => 'search_console',
      p_account_id         => 'sc-domain:example.com',
      p_entity_id          => 'query:widgets',
      p_entity_type        => 'query',
      p_native_entity_type => 'query',
      p_native_id          => 'widgets',
      p_date               => '2026-08-14',
      p_currency           => 'XXX',
      p_timezone           => 'America/Los_Angeles',
      p_attribution_window => null,
      p_fetched_at         => '2026-08-15T06:00:00Z',
      p_first_seen_at      => '2026-08-15T06:00:00Z',
      p_restates_until     => '2026-09-11T06:00:00Z',
      p_clicks             => 412,
      p_impressions        => 9100,
      p_position           => 6.2
    );

    select position into v_stored from public.envelope_rows
     where workspace_id = 'a2000000-0000-4000-8000-000000000001';

    -- Zero must be refused by the column, not merely by the connector.
    begin
      update public.envelope_rows set position = 0
       where workspace_id = 'a2000000-0000-4000-8000-000000000001';
    exception when check_violation then
      v_zero_ok := true;
    end;

    -- Restate it: a rank that moved is a correction the outbox must announce.
    perform app.upsert_envelope_row(
      p_workspace_id       => 'a2000000-0000-4000-8000-000000000001',
      p_connection_id      => null,
      p_source             => 'search_console',
      p_account_id         => 'sc-domain:example.com',
      p_entity_id          => 'query:widgets',
      p_entity_type        => 'query',
      p_native_entity_type => 'query',
      p_native_id          => 'widgets',
      p_date               => '2026-08-14',
      p_currency           => 'XXX',
      p_timezone           => 'America/Los_Angeles',
      p_attribution_window => null,
      p_fetched_at         => '2026-08-16T06:00:00Z',
      p_first_seen_at      => '2026-08-16T06:00:00Z',
      p_restates_until     => '2026-09-11T06:00:00Z',
      p_clicks             => 412,
      p_impressions        => 9100,
      p_position           => 4.1
    );

    -- QUALIFIED, AND IT HAS TO BE. `position` is a col_name keyword: it works unquoted as a
    -- column name in a select list and in `is distinct from`, but a bare `max(position)` is
    -- parsed as the POSITION(x IN y) function and is a syntax error. The first version of this
    -- block used it, the whole block aborted, and `v_reached` reported that the verdicts were
    -- void -- which is precisely what that sentinel is for.
    -- Three separate reads rather than one aggregate: `revised_from` is jsonb and there is no
    -- max(jsonb), which the first version of this block discovered the hard way.
    select count(*) into v_events
      from public.restatement_events
     where workspace_id = 'a2000000-0000-4000-8000-000000000001';

    select revised_from into v_before
      from public.restatement_events
     where workspace_id = 'a2000000-0000-4000-8000-000000000001'
     order by id desc limit 1;

    select r.position into v_after_pos
      from public.envelope_rows r
     where r.workspace_id = 'a2000000-0000-4000-8000-000000000001';

    v_reached := true;
    raise exception 'discarding the fixture';
  exception
    when others then
      -- CAPTURED, NOT SWALLOWED. The abort is deliberate -- it is what discards the fixture -- but
      -- an abort for any OTHER reason is a real failure, and a sentinel that says "void" without
      -- saying why costs the next reader an afternoon.
      if sqlerrm <> 'discarding the fixture' then v_error := sqlerrm; end if;
  end;

  perform app_test.check(
    'the position round-trip block ran to completion, so the verdicts below mean something',
    v_reached,
    coalesce('the block aborted early: ' || v_error, 'no error was captured'));
  perform app_test.check('a position written through the upsert is stored', v_stored = 6.2,
    format('stored position was %s', coalesce(v_stored::text, 'null')));
  perform app_test.check('the column itself refuses position zero', v_zero_ok);
  perform app_test.check('moving a position records exactly one restatement event', v_events = 1,
    format('recorded %s event(s)', coalesce(v_events::text, 'null')));
  perform app_test.check(
    'the event carries the OLD position, which is what record_restatement must have seen',
    v_before ? 'position' and (v_before ->> 'position')::numeric = 6.2,
    format('revised_from was %s', coalesce(v_before::text, 'null')));
  perform app_test.check('the row now holds the new position', v_after_pos = 4.1,
    format('row position after restatement was %s', coalesce(v_after_pos::text, 'null')));
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
  if v_failed > 0 then raise exception 'position: % assertion(s) failed', v_failed; end if;
  if v_total < 14 then
    raise exception 'position: only % assertion(s) ran; expected at least 14', v_total;
  end if;
end $$;
