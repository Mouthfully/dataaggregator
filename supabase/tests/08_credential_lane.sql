-- The credential lane column, and the three things that must be true of it.
--
-- This suite is short because the column is small, but it covers the part a migration can get
-- wrong silently: the BACKFILL. Adding a nullable column, filling it and then constraining it is
-- three statements, and the failure mode of getting the middle one wrong is not an error -- it is
-- a set of rows quietly filed under the wrong lane, which `openCredential` then refuses to open
-- at pull time, hours later, for reasons that point at the vault rather than at this migration.
--
-- So the backfill is exercised against rows that existed BEFORE the column did, rather than
-- asserted by reading the update statement.

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
-- The enum itself.
-- ---------------------------------------------------------------------------------------------
do $$
declare v_members text[];
begin
  select array_agg(e.enumlabel order by e.enumsortorder)
    into v_members
    from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    join pg_namespace n on n.oid = t.typnamespace
   where n.nspname = 'app' and t.typname = 'credential_lane';

  perform app_test.check(
    'app.credential_lane carries exactly the three lanes packages/connections names',
    v_members = array['oauth', 'key_secret', 'bearer'],
    format('app.credential_lane is %s', coalesce(v_members::text, '(absent)'))
  );
end $$;

-- ---------------------------------------------------------------------------------------------
-- NOT NULL, and NO DEFAULT.
--
-- The absence of a default is the assertion, not an omission this file is tolerating. A default of
-- 'oauth' would let an insert that forgot the column succeed and be wrong -- a bearer connection
-- filed as a grant, discovered when the scheduler cannot open it.
-- ---------------------------------------------------------------------------------------------
do $$
declare v_notnull boolean; v_default text;
begin
  select a.attnotnull, pg_get_expr(d.adbin, d.adrelid)
    into v_notnull, v_default
    from pg_attribute a
    left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
   where a.attrelid = 'public.connections'::regclass and a.attname = 'credential_lane';

  perform app_test.check('credential_lane is NOT NULL', coalesce(v_notnull, false));
  perform app_test.check(
    'credential_lane has no default, so an insert that omits it is a write error',
    v_default is null,
    format('credential_lane defaults to %s', coalesce(v_default, '(none)'))
  );
end $$;

-- ---------------------------------------------------------------------------------------------
-- The backfill, exercised rather than read.
--
-- Rows are inserted with the column forced back to NULL -- which is what a pre-migration row is --
-- and then the migration's own mapping is re-run against them. Anything the update misses shows
-- up as a NOT NULL violation here instead of as an unopenable credential in production.
-- ---------------------------------------------------------------------------------------------
-- THE VERDICTS ARE COMPUTED INSIDE A DOOMED SUBTRANSACTION AND RECORDED AFTER IT.
--
-- `app_test.check()` records by INSERTING, so a `begin ... rollback` block discards its own
-- evidence: the assertions run, the rows vanish, and the summary counts what survived -- issue
-- #17, and the first version of this very block, which reported 4 of 8 and was caught only by the
-- floor at the bottom of the file.
--
-- `commit` is the fix when the leftovers are harmless, which is how 06_jwt_claims.sql was
-- repaired. Here they are not: the block drops a NOT NULL constraint before restoring it, and a
-- run that committed halfway would leave the schema weaker than the migration made it -- for
-- every file after this one, and for anyone reading the database afterwards to see what the
-- migration did. So the pattern is 01_rls_isolation.sql's `check_undone`: PL/pgSQL variables are
-- memory, a subtransaction rollback does not restore them, and the verdicts are inserted outside.
do $$
declare
  v_reached    boolean := false;
  v_none_null  boolean;
  v_woo        boolean;
  v_ga4        boolean;
  v_meta       boolean;
  v_restored   boolean;
begin
  begin
    insert into auth.users (id, email) values
      ('f0000000-0000-4000-8000-000000000001', 'lane@test.test') on conflict do nothing;
    insert into public.organisations (id, name, slug) values
      ('f1000000-0000-4000-8000-000000000001', 'Lane Org', 'lane-org') on conflict do nothing;
    insert into public.workspaces (id, organisation_id, name, slug) values
      ('f2000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001',
       'Lane Workspace', 'lane-workspace') on conflict do nothing;

    -- A pre-migration row is one written while the column did not exist. This is as close as the
    -- suite can stand to that, and closer than asserting the update statement by reading it.
    alter table public.connections alter column credential_lane drop not null;

    insert into public.connections
      (id, workspace_id, provider, external_account_id, credential_ciphertext, credential_iv,
       wrapped_dek, credential_lane)
    values
      ('f3000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000001',
       'woocommerce', 'https://shop.example.com', '\x00', '\x00', '\x00', null),
      ('f3000000-0000-4000-8000-000000000002', 'f2000000-0000-4000-8000-000000000001',
       'ga4', 'properties/123', '\x00', '\x00', '\x00', null),
      ('f3000000-0000-4000-8000-000000000003', 'f2000000-0000-4000-8000-000000000001',
       'meta_ads', 'act_1', '\x00', '\x00', '\x00', null);

    -- Verbatim from 20260912000100_credential_lane.sql.
    update public.connections
       set credential_lane = case
             when provider = 'woocommerce' then 'key_secret'::app.credential_lane
             else 'oauth'::app.credential_lane
           end
     where credential_lane is null;

    select count(*) = 0 into v_none_null from public.connections where credential_lane is null;
    select credential_lane = 'key_secret' into v_woo
      from public.connections where id = 'f3000000-0000-4000-8000-000000000001';
    select credential_lane = 'oauth' into v_ga4
      from public.connections where id = 'f3000000-0000-4000-8000-000000000002';
    select credential_lane = 'oauth' into v_meta
      from public.connections where id = 'f3000000-0000-4000-8000-000000000003';

    alter table public.connections alter column credential_lane set not null;

    -- Set LAST. If anything above raised, this stays false and the verdicts below are known to be
    -- meaningless rather than quietly counted as passes -- the same distinction `check_undone`
    -- draws with `p_undone`.
    v_reached := true;

    -- Aborts the subtransaction on purpose. The variables above survive; the fixture does not.
    raise exception 'discarding the fixture';
  exception
    when others then null;
  end;

  perform app_test.check(
    'the backfill block ran to completion, so the verdicts below mean something',
    v_reached,
    'an earlier statement raised; every backfill verdict in this block is void'
  );

  perform app_test.check('the backfill leaves no row unlabelled', v_none_null);
  perform app_test.check('a pre-existing WooCommerce row backfills to key_secret', v_woo);
  perform app_test.check('a pre-existing GA4 row backfills to oauth', v_ga4);

  -- The one that documents the mapping's SHELF LIFE. Every Meta row that existed before this
  -- migration is an OAuth grant, because the bearer lane did not exist to produce another kind --
  -- so backfilling it to `oauth` is right. It is right ONLY for rows written under that
  -- assumption, which is why the mapping lives in a one-time update and not in a default.
  perform app_test.check(
    'a pre-existing Meta row backfills to oauth, because bearer did not exist yet', v_meta);

  -- The harness checking itself. If the abort left the column nullable, every later reader sees a
  -- schema weaker than the migration produced, and reporting that as a pass is the same failure
  -- in a different costume.
  select a.attnotnull into v_restored
    from pg_attribute a
   where a.attrelid = 'public.connections'::regclass and a.attname = 'credential_lane';
  if not coalesce(v_restored, false) then
    raise exception 'credential lane: the fixture left credential_lane nullable';
  end if;
end $$;

-- ---------------------------------------------------------------------------------------------
-- A row that omits the column is refused.
-- ---------------------------------------------------------------------------------------------
do $$
declare v_refused boolean := false;
begin
  begin
    insert into public.connections
      (id, workspace_id, provider, external_account_id, credential_ciphertext, credential_iv,
       wrapped_dek)
    values
      ('f4000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000001',
       'ga4', 'properties/999', '\x00', '\x00', '\x00');
  exception when not_null_violation or foreign_key_violation then
    -- Either is the refusal this asserts: the workspace fixture above was rolled back, so the FK
    -- may fire first depending on constraint order. Both mean the row did not land.
    v_refused := true;
  end;

  perform app_test.check('an insert that omits credential_lane does not land', v_refused);
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
  if v_failed > 0 then raise exception 'credential lane: % assertion(s) failed', v_failed; end if;
  if v_total < 9 then
    raise exception 'credential lane: only % assertion(s) ran; expected at least 9', v_total;
  end if;
end $$;
