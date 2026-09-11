-- Row-level security tests.
--
-- Specification section 15 promises strict tenant isolation at the row level and "no
-- cross-workspace aggregation ever". This file is where that promise is checked, because a policy
-- that has never been run against a hostile session is a comment.
--
-- Every assertion runs as the `authenticated` role. Running them as the owner or a superuser would
-- pass trivially: superusers bypass RLS entirely, and the table owner bypasses it too unless the
-- table is FORCE ROW LEVEL SECURITY, which is why the migration sets FORCE and not just ENABLE.
--
-- Fixture (an agency and an unrelated brand, which is the shape section 15 describes):
--
--   Org A "Northwind Agency"      Org B "Contoso Brand"
--     workspace w1 "Client One"     workspace w3 "Contoso"
--     workspace w2 "Client Two"
--     alice   owner                 carol  owner
--     bob     analyst, granted w1 only
--     dave    viewer,  granted w1 only

create schema if not exists app_test;

create table if not exists app_test.results (
  id serial primary key,
  name text not null,
  passed boolean not null,
  detail text
);
truncate app_test.results;

create or replace function app_test.check(p_name text, p_passed boolean, p_detail text default null)
returns void language sql as $$
  insert into app_test.results (name, passed, detail) values (p_name, coalesce(p_passed, false), p_detail);
$$;

-- Assert that a statement does not take effect.
--
-- RLS denies in two different ways and conflating them is how a suite convinces you that you are
-- protected when you are not:
--
--   INSERT  violating a WITH CHECK raises 42501, insufficient_privilege.
--   UPDATE / DELETE  are FILTERED by the USING clause. No error is raised at all; the statement
--                    succeeds and affects zero rows.
--
-- A harness that only catches the exception reports "unexpectedly succeeded" for every correctly
-- denied UPDATE. Worse, one that treats any non-error as success would pass an UPDATE that really
-- did modify another tenant's row. So both outcomes are accepted, and the row count is recorded,
-- so the summary shows WHICH kind of denial happened rather than just that something did not
-- happen.
create or replace function app_test.check_denied(p_name text, p_sql text)
returns void language plpgsql as $$
declare
  v_rows bigint;
begin
  execute p_sql;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    perform app_test.check(p_name, true, 'denied by row filter: 0 rows affected');
  else
    perform app_test.check(p_name, false,
      format('POLICY BYPASS: statement affected %s row(s)', v_rows));
  end if;
exception
  when insufficient_privilege or check_violation then
    perform app_test.check(p_name, true, 'denied by policy: ' || sqlerrm);
  when others then
    perform app_test.check(p_name, false, 'unexpected error: ' || sqlerrm);
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Fixture, created as the owner so RLS does not interfere with setup.
-- ---------------------------------------------------------------------------------------------

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'alice@northwind.test'),
  ('22222222-2222-2222-2222-222222222222', 'bob@northwind.test'),
  ('33333333-3333-3333-3333-333333333333', 'carol@contoso.test'),
  ('44444444-4444-4444-4444-444444444444', 'dave@northwind.test'),
  ('55555555-5555-5555-5555-555555555555', 'mallory@nowhere.test')
on conflict do nothing;

insert into public.organisations (id, name, slug) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Northwind Agency', 'northwind'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'Contoso Brand', 'contoso');

insert into public.workspaces (id, organisation_id, name, slug) values
  ('c0000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Client One', 'client-one'),
  ('c0000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'Client Two', 'client-two'),
  ('c0000000-0000-0000-0000-000000000003', 'bbbbbbbb-0000-0000-0000-000000000002', 'Contoso', 'contoso');

insert into public.members (id, organisation_id, user_id, role) values
  ('d0000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'owner'),
  ('d0000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'analyst'),
  ('d0000000-0000-0000-0000-000000000003', 'bbbbbbbb-0000-0000-0000-000000000002', '33333333-3333-3333-3333-333333333333', 'owner'),
  ('d0000000-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000001', '44444444-4444-4444-4444-444444444444', 'viewer');

-- bob and dave reach Client One only.
insert into public.workspace_members (workspace_id, member_id) values
  ('c0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000002'),
  ('c0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000004');

insert into public.connections
  (id, workspace_id, provider, external_account_id, credential_ciphertext, credential_iv, wrapped_dek)
values
  ('e0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'google_ads', '111-111-1111', '\x01', '\x02', '\x03'),
  ('e0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000002', 'meta_ads',   'act_222',      '\x01', '\x02', '\x03'),
  ('e0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000003', 'ga4',        'properties/333','\x01', '\x02', '\x03');

insert into public.api_keys (id, workspace_id, name, key_prefix, key_hash, monthly_credit_budget)
values
  ('f0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'CI key',
   'mp_live_aaaaaaaa', digest('mp_live_aaaaaaaa_secret_one', 'sha256'), 100),
  ('f0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000003', 'Contoso key',
   'mp_live_bbbbbbbb', digest('mp_live_bbbbbbbb_secret_two', 'sha256'), null),
  ('f0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000001', 'Revoked key',
   'mp_live_cccccccc', digest('mp_live_cccccccc_secret_three', 'sha256'), null);

update public.api_keys set revoked_at = now() where id = 'f0000000-0000-0000-0000-000000000003';

grant usage on schema app_test to authenticated, anon;
grant all on app_test.results to authenticated, anon;
grant usage, select on all sequences in schema app_test to authenticated, anon;
grant execute on all functions in schema app_test to authenticated, anon;

-- Each assertion returns a row; only the summary at the end is worth reading.
\o /dev/null

-- ---------------------------------------------------------------------------------------------
-- Alice, owner of Northwind. Reaches both of her workspaces implicitly, and nothing of Contoso's.
-- ---------------------------------------------------------------------------------------------
begin;
  set local role authenticated;
  select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);

  select app_test.check('owner sees both workspaces in her organisation',
    (select count(*) = 2 from public.workspaces));
  select app_test.check('owner sees only her own organisation',
    (select count(*) = 1 from public.organisations));
  select app_test.check('owner sees both her workspaces'' connections',
    (select count(*) = 2 from public.connections));
  select app_test.check('owner sees her organisation''s API keys and only those',
    (select count(*) = 2 from public.api_keys));
  select app_test.check('owner cannot see the other organisation''s connection',
    (select count(*) = 0 from public.connections
      where id = 'e0000000-0000-0000-0000-000000000003'));
commit;

-- ---------------------------------------------------------------------------------------------
-- Bob, analyst granted Client One only. This is the agency isolation case: one login, forty
-- clients, and he must see exactly the ones he was granted.
-- ---------------------------------------------------------------------------------------------
begin;
  set local role authenticated;
  select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);

  select app_test.check('analyst sees only the workspace he was granted',
    (select count(*) = 1 from public.workspaces));
  select app_test.check('the workspace he sees is the granted one',
    (select id = 'c0000000-0000-0000-0000-000000000001' from public.workspaces));
  select app_test.check('analyst sees only the granted workspace''s connections',
    (select count(*) = 1 from public.connections));
  select app_test.check('analyst cannot read a sibling workspace''s connection',
    (select count(*) = 0 from public.connections
      where workspace_id = 'c0000000-0000-0000-0000-000000000002'));
  select app_test.check('analyst cannot read API keys at all',
    (select count(*) = 0 from public.api_keys));
  select app_test.check('analyst cannot read invitations',
    (select count(*) = 0 from public.invitations));

  -- He may write in the workspace he holds...
  select app_test.check_denied('analyst cannot create a connection in a workspace he does not hold', $sql$
    insert into public.connections (workspace_id, provider, external_account_id,
                                    credential_ciphertext, credential_iv, wrapped_dek)
    values ('c0000000-0000-0000-0000-000000000002', 'google_ads', 'stolen',
            '\x01'::bytea, '\x02'::bytea, '\x03'::bytea);
  $sql$);
  select app_test.check_denied('analyst cannot create a workspace', $sql$
    insert into public.workspaces (organisation_id, name, slug)
    values ('aaaaaaaa-0000-0000-0000-000000000001', 'Sneaky', 'sneaky');
  $sql$);
  select app_test.check_denied('analyst cannot promote himself', $sql$
    update public.members set role = 'owner'
    where id = 'd0000000-0000-0000-0000-000000000002';
  $sql$);
  -- Belt and braces: a filtered UPDATE and a successful one both "do not raise", so check the
  -- value itself rather than trusting the row count alone.
  select app_test.check('analyst is still an analyst afterwards',
    (select role = 'analyst' from public.members
      where id = 'd0000000-0000-0000-0000-000000000002'));
commit;

-- ---------------------------------------------------------------------------------------------
-- Dave, viewer. Reads what he is granted, writes nothing.
-- ---------------------------------------------------------------------------------------------
begin;
  set local role authenticated;
  select set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', true);

  select app_test.check('viewer reads his granted workspace',
    (select count(*) = 1 from public.workspaces));
  select app_test.check_denied('viewer cannot create a connection even where he can read', $sql$
    insert into public.connections (workspace_id, provider, external_account_id,
                                    credential_ciphertext, credential_iv, wrapped_dek)
    values ('c0000000-0000-0000-0000-000000000001', 'ga4', 'nope',
            '\x01'::bytea, '\x02'::bytea, '\x03'::bytea);
  $sql$);
commit;

-- ---------------------------------------------------------------------------------------------
-- Carol, another tenant entirely. The cross-tenant boundary.
-- ---------------------------------------------------------------------------------------------
begin;
  set local role authenticated;
  select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);

  select app_test.check('other tenant sees only her own workspace',
    (select count(*) = 1 from public.workspaces));
  select app_test.check('other tenant sees only her own organisation',
    (select count(*) = 1 from public.organisations));
  select app_test.check('other tenant sees none of the agency''s connections',
    (select count(*) = 1 from public.connections));
  select app_test.check('other tenant sees no member of the agency',
    (select count(*) = 1 from public.members));
  select app_test.check_denied('other tenant cannot insert into the agency''s organisation', $sql$
    insert into public.workspaces (organisation_id, name, slug)
    values ('aaaaaaaa-0000-0000-0000-000000000001', 'Hostile', 'hostile');
  $sql$);
commit;

-- ---------------------------------------------------------------------------------------------
-- Mallory: authenticated, but a member of nothing. The "signed up and poked around" case.
-- ---------------------------------------------------------------------------------------------
begin;
  set local role authenticated;
  select set_config('request.jwt.claim.sub', '55555555-5555-5555-5555-555555555555', true);

  select app_test.check('a member of nothing sees no organisation',
    (select count(*) = 0 from public.organisations));
  select app_test.check('a member of nothing sees no workspace',
    (select count(*) = 0 from public.workspaces));
  select app_test.check('a member of nothing sees no connection',
    (select count(*) = 0 from public.connections));
  select app_test.check('a member of nothing sees no member row',
    (select count(*) = 0 from public.members));
  select app_test.check('a member of nothing sees no API key',
    (select count(*) = 0 from public.api_keys));
commit;

-- ---------------------------------------------------------------------------------------------
-- An API-key session: a token minted by the edge carrying only a workspace_id, no user.
-- ---------------------------------------------------------------------------------------------
begin;
  set local role authenticated;
  select set_config('request.jwt.claim.workspace_id', 'c0000000-0000-0000-0000-000000000001', true);

  select app_test.check('API-key session reads its own workspace',
    (select count(*) = 1 from public.workspaces));
  select app_test.check('API-key session reads its own workspace''s connections',
    (select count(*) = 1 from public.connections));
  select app_test.check('API-key session cannot read a sibling workspace''s connections',
    (select count(*) = 0 from public.connections
      where workspace_id = 'c0000000-0000-0000-0000-000000000002'));
  select app_test.check('API-key session cannot enumerate API keys, not even its own',
    (select count(*) = 0 from public.api_keys));
  select app_test.check('API-key session cannot read members',
    (select count(*) = 0 from public.members));
  select app_test.check('API-key session cannot read invitations',
    (select count(*) = 0 from public.invitations));

  -- The stolen-key case: reads are the whole authority of a key.
  select app_test.check_denied('API-key session cannot re-point a connection', $sql$
    update public.connections set external_account_id = 'attacker'
    where id = 'e0000000-0000-0000-0000-000000000001';
  $sql$);
  select app_test.check('the connection still points where it did',
    (select external_account_id = '111-111-1111' from public.connections
      where id = 'e0000000-0000-0000-0000-000000000001'));
  select app_test.check_denied('API-key session cannot create a connection', $sql$
    insert into public.connections (workspace_id, provider, external_account_id,
                                    credential_ciphertext, credential_iv, wrapped_dek)
    values ('c0000000-0000-0000-0000-000000000001', 'meta_ads', 'attacker',
            '\x01'::bytea, '\x02'::bytea, '\x03'::bytea);
  $sql$);
commit;

-- ---------------------------------------------------------------------------------------------
-- verify_api_key: the one anon-executable function, and the reason the edge needs no service role.
-- ---------------------------------------------------------------------------------------------
begin;
  set local role anon;

  select app_test.check('a valid key resolves to its workspace',
    (select (verify_api_key(digest('mp_live_aaaaaaaa_secret_one', 'sha256'))).workspace_id
            = 'c0000000-0000-0000-0000-000000000001'));
  select app_test.check('a valid key resolves to its organisation',
    (select (verify_api_key(digest('mp_live_aaaaaaaa_secret_one', 'sha256'))).organisation_id
            = 'aaaaaaaa-0000-0000-0000-000000000001'));
  select app_test.check('a valid key reports its remaining budget',
    (select (verify_api_key(digest('mp_live_aaaaaaaa_secret_one', 'sha256'))).credits_remaining = 100));
  select app_test.check('a revoked key resolves to nothing',
    (select (verify_api_key(digest('mp_live_cccccccc_secret_three', 'sha256'))).api_key_id is null));
  select app_test.check('an unknown key resolves to nothing',
    (select (verify_api_key(digest('not-a-real-key', 'sha256'))).api_key_id is null));
  select app_test.check('a malformed hash is rejected without a lookup',
    (select (verify_api_key('\xdeadbeef'::bytea)).api_key_id is null));

  -- anon is granted this one function and nothing else. If any of these ever succeed, the
  -- unauthenticated surface has grown.
  select app_test.check_denied('anon cannot read organisations',
    'select count(*) from public.organisations');
  select app_test.check_denied('anon cannot read connections',
    'select count(*) from public.connections');
  select app_test.check_denied('anon cannot read api_keys',
    'select count(*) from public.api_keys');
commit;

-- ---------------------------------------------------------------------------------------------
-- Spend budgets. Specification section 8: a hard cap, not an alert, and failed calls are unbilled.
-- ---------------------------------------------------------------------------------------------
begin;
  set local role anon;

  select app_test.check('a charge inside the budget is accepted',
    (select consume_api_key_credits('f0000000-0000-0000-0000-000000000001', 60)));
  select app_test.check('a charge that would exceed the budget is refused',
    (select not consume_api_key_credits('f0000000-0000-0000-0000-000000000001', 50)));
  -- Read back through the function rather than the table: anon cannot select api_keys, which is
  -- itself the point, so an assertion that reads the table directly would be testing the test.
  select app_test.check('a refused charge does not consume credits',
    (select (verify_api_key(digest('mp_live_aaaaaaaa_secret_one', 'sha256'))).credits_remaining = 40));
  select app_test.check('a charge that exactly reaches the budget is accepted',
    (select consume_api_key_credits('f0000000-0000-0000-0000-000000000001', 40)));
  select app_test.check('a key with no budget is uncapped',
    (select consume_api_key_credits('f0000000-0000-0000-0000-000000000002', 100000)));
  select app_test.check('a revoked key cannot be charged',
    (select not consume_api_key_credits('f0000000-0000-0000-0000-000000000003', 1)));
  select app_test.check('a negative charge is refused',
    (select not consume_api_key_credits('f0000000-0000-0000-0000-000000000001', -10)));
commit;

-- ---------------------------------------------------------------------------------------------
-- Soft deletion has to actually remove access, or "delete my data" means nothing.
-- ---------------------------------------------------------------------------------------------
begin;
  update public.workspaces set deleted_at = now()
   where id = 'c0000000-0000-0000-0000-000000000002';

  set local role authenticated;
  select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);

  select app_test.check('a soft-deleted workspace disappears for its owner',
    (select count(*) = 1 from public.workspaces));
  select app_test.check('a soft-deleted workspace''s connections disappear too',
    (select count(*) = 0 from public.connections
      where workspace_id = 'c0000000-0000-0000-0000-000000000002'));
rollback;

-- ---------------------------------------------------------------------------------------------
-- Summary
-- ---------------------------------------------------------------------------------------------
\o

select name, case when passed then 'PASS' else 'FAIL' end as result, detail
from app_test.results
where not passed
order by id;

select count(*) filter (where passed) as passed,
       count(*) filter (where not passed) as failed,
       count(*) as total
from app_test.results;

do $$
declare v_failed integer;
begin
  select count(*) into v_failed from app_test.results where not passed;
  if v_failed > 0 then
    raise exception 'RLS isolation: % assertion(s) failed', v_failed;
  end if;
end $$;
