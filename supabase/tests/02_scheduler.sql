-- Scheduler tests.
--
-- The scheduler is the one actor that legitimately sees across tenants, which makes it the one place
-- a mistake leaks everything. These assertions are about what it can NOT reach as much as what it can.

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

create or replace function app_test.check_denied(p_name text, p_sql text)
returns void language plpgsql as $$
declare v_rows bigint;
begin
  execute p_sql;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    perform app_test.check(p_name, true, 'denied by row filter: 0 rows affected');
  else
    perform app_test.check(p_name, false, format('POLICY BYPASS: affected %s row(s)', v_rows));
  end if;
exception
  when insufficient_privilege or check_violation then
    perform app_test.check(p_name, true, 'denied by policy: ' || sqlerrm);
  when others then
    perform app_test.check(p_name, false, 'unexpected error: ' || sqlerrm);
end;
$$;

grant usage on schema app_test to authenticated, anon, app_scheduler;
grant all on app_test.results to authenticated, anon, app_scheduler;
grant usage, select on all sequences in schema app_test to authenticated, anon, app_scheduler;
grant execute on all functions in schema app_test to authenticated, anon, app_scheduler;

-- Fixture: two tenants, four connections in varying states.
insert into auth.users (id, email) values
  ('91111111-1111-1111-1111-111111111111', 'scheduler-alice@northwind.test'),
  ('93333333-3333-3333-3333-333333333333', 'scheduler-carol@contoso.test')
on conflict do nothing;

insert into public.organisations (id, name, slug) values
  ('9aaaaaaa-0000-0000-0000-000000000001', 'Northwind Agency', 'northwind-sched'),
  ('9bbbbbbb-0000-0000-0000-000000000002', 'Contoso Brand', 'contoso-sched');

insert into public.workspaces (id, organisation_id, name, slug) values
  ('9c000000-0000-0000-0000-000000000001', '9aaaaaaa-0000-0000-0000-000000000001', 'Client One', 'client-one-sched'),
  ('9c000000-0000-0000-0000-000000000003', '9bbbbbbb-0000-0000-0000-000000000002', 'Contoso', 'contoso-sched');

insert into public.members (id, organisation_id, user_id, role) values
  ('9d000000-0000-0000-0000-000000000001', '9aaaaaaa-0000-0000-0000-000000000001', '91111111-1111-1111-1111-111111111111', 'owner'),
  ('9d000000-0000-0000-0000-000000000003', '9bbbbbbb-0000-0000-0000-000000000002', '93333333-3333-3333-3333-333333333333', 'owner');

insert into public.connections
  (id, workspace_id, provider, external_account_id, credential_ciphertext, credential_iv, wrapped_dek, status, expires_at, last_backfill_at)
values
  -- due: never pulled
  ('9e000000-0000-0000-0000-000000000001', '9c000000-0000-0000-0000-000000000001', 'google_ads', '111', '\x01', '\x02', '\x03', 'active', null, null),
  -- due: pulled yesterday, and belongs to the OTHER tenant
  ('9e000000-0000-0000-0000-000000000003', '9c000000-0000-0000-0000-000000000003', 'ga4', '333', '\x01', '\x02', '\x03', 'active', null, '2026-09-07T02:00:00Z'),
  -- not due: needs reauth
  ('9e000000-0000-0000-0000-000000000004', '9c000000-0000-0000-0000-000000000001', 'meta_ads', '444', '\x01', '\x02', '\x03', 'needs_reauth', null, null),
  -- not due: the grant has expired, so pulling would burn shared quota to earn a 401
  ('9e000000-0000-0000-0000-000000000005', '9c000000-0000-0000-0000-000000000001', 'search_console', '555', '\x01', '\x02', '\x03', 'active', '2026-09-01T00:00:00Z', null);

-- ---------------------------------------------------------------------------------------------
-- What the scheduler sees
-- ---------------------------------------------------------------------------------------------
begin;
  set local role app_scheduler;

  -- Scoped to this suite's own fixtures. The earlier RLS suite leaves its connections behind and
  -- due_connections legitimately returns those too -- which is the cross-tenant behaviour under test,
  -- so the assertion names the rows it means rather than depending on an absolute count.
  select app_test.check('the scheduler sees work across BOTH tenants',
    (select count(*) = 2 from app.due_connections('2026-09-08T03:00:00Z'::timestamptz)
      where workspace_id in ('9c000000-0000-0000-0000-000000000001', '9c000000-0000-0000-0000-000000000003')));

  select app_test.check('a needs_reauth connection is not offered as work',
    (select count(*) = 0 from app.due_connections('2026-09-08T03:00:00Z'::timestamptz)
      where connection_id = '9e000000-0000-0000-0000-000000000004'));

  select app_test.check('an expired grant is not offered as work',
    (select count(*) = 0 from app.due_connections('2026-09-08T03:00:00Z'::timestamptz)
      where connection_id = '9e000000-0000-0000-0000-000000000005'));

  select app_test.check('a connection already pulled today is not offered again',
    (select count(*) = 1 from app.due_connections('2026-09-07T12:00:00Z'::timestamptz)
      where workspace_id in ('9c000000-0000-0000-0000-000000000001', '9c000000-0000-0000-0000-000000000003')));

  select app_test.check('oldest first, so one busy tenant cannot starve the rest',
    (select connection_id = '9e000000-0000-0000-0000-000000000001'
       from app.due_connections('2026-09-08T03:00:00Z'::timestamptz) limit 1));
commit;

-- ---------------------------------------------------------------------------------------------
-- What the scheduler must NOT reach. This is the half that matters.
-- ---------------------------------------------------------------------------------------------
begin;
  set local role app_scheduler;

  select app_test.check('the work list carries no credential ciphertext',
    (select count(*) = 0
       from information_schema.columns
      where table_schema = 'app' and table_name = 'due_connections'
        and column_name in ('credential_ciphertext', 'wrapped_dek', 'credential_iv')));

  -- Enumeration and access are different privileges. A compromised scheduler learns which tenants
  -- exist; it does not learn how to authenticate as any of them.
  select app_test.check_denied('the scheduler cannot read the connections table directly',
    'select count(*) from public.connections');
  select app_test.check_denied('the scheduler cannot read api_keys',
    'select count(*) from public.api_keys');
  select app_test.check_denied('the scheduler cannot read members',
    'select count(*) from public.members');
  select app_test.check_denied('the scheduler cannot read organisations',
    'select count(*) from public.organisations');
commit;

-- ---------------------------------------------------------------------------------------------
-- And no tenant may ask the cross-tenant question
-- ---------------------------------------------------------------------------------------------
begin;
  set local role authenticated;
  select set_config('request.jwt.claim.sub', '91111111-1111-1111-1111-111111111111', true);

  select app_test.check_denied('an owner cannot call due_connections',
    'select count(*) from app.due_connections()');
  select app_test.check_denied('an owner cannot claim a connection',
    'select app.claim_connection(''9e000000-0000-0000-0000-000000000001''::uuid, ''forged'')');
commit;

begin;
  set local role anon;
  select app_test.check_denied('anon cannot call due_connections',
    'select count(*) from app.due_connections()');
commit;

-- ---------------------------------------------------------------------------------------------
-- Leasing: two instances must not pull the same connection and spend a shared quota twice
-- ---------------------------------------------------------------------------------------------
begin;
  set local role app_scheduler;

  select app_test.check('the first instance takes the claim',
    (select app.claim_connection('9e000000-0000-0000-0000-000000000001'::uuid, 'worker-a', '2026-09-08T03:00:00Z'::timestamptz)));

  select app_test.check('the second instance is refused',
    (select not app.claim_connection('9e000000-0000-0000-0000-000000000001'::uuid, 'worker-b', '2026-09-08T03:00:01Z'::timestamptz)));

  select app_test.check('a claimed connection disappears from the work list',
    (select count(*) = 0 from app.due_connections('2026-09-08T03:00:02Z'::timestamptz)
      where connection_id = '9e000000-0000-0000-0000-000000000001'));

  -- A Worker that dies mid-backfill cannot release its own lease, so the lease has to expire.
  select app_test.check('an abandoned claim is reoffered after the lease expires',
    (select count(*) = 1 from app.due_connections('2026-09-08T03:20:00Z'::timestamptz)
      where connection_id = '9e000000-0000-0000-0000-000000000001'));

  select app_test.check('another instance can take over an abandoned claim',
    (select app.claim_connection('9e000000-0000-0000-0000-000000000001'::uuid, 'worker-c', '2026-09-08T03:20:00Z'::timestamptz)));
commit;

-- ---------------------------------------------------------------------------------------------
-- Closing a lease
-- ---------------------------------------------------------------------------------------------
begin;
  set local role app_scheduler;

  select app.record_backfill('9e000000-0000-0000-0000-000000000001'::uuid, true, '2026-09-08T03:30:00Z'::timestamptz);
  select app_test.check('a successful run stops the connection being due today',
    (select count(*) = 0 from app.due_connections('2026-09-08T04:00:00Z'::timestamptz)
      where connection_id = '9e000000-0000-0000-0000-000000000001'));

  -- A failed run must be retried on the next sweep, not silently skipped for a day.
  select app.claim_connection('9e000000-0000-0000-0000-000000000003'::uuid, 'worker-d', '2026-09-08T04:00:00Z'::timestamptz);
  select app.record_backfill('9e000000-0000-0000-0000-000000000003'::uuid, false, '2026-09-08T04:05:00Z'::timestamptz);
  select app_test.check('a failed run is offered again rather than skipped for the day',
    (select count(*) = 1 from app.due_connections('2026-09-08T04:10:00Z'::timestamptz)
      where connection_id = '9e000000-0000-0000-0000-000000000003'));
commit;

-- ---------------------------------------------------------------------------------------------
-- Soft deletion stops work immediately
-- ---------------------------------------------------------------------------------------------
begin;
  update public.workspaces set deleted_at = now() where id = '9c000000-0000-0000-0000-000000000003';

  set local role app_scheduler;
  -- Otherwise "delete my data" keeps calling the customer's ad platform on their behalf.
  select app_test.check('a deleted workspace stops generating work at once',
    (select count(*) = 0 from app.due_connections('2026-09-08T05:00:00Z'::timestamptz)
      where workspace_id = '9c000000-0000-0000-0000-000000000003'));
rollback;

\o

select name, 'FAIL' as result, detail from app_test.results where not passed order by id;
select count(*) filter (where passed) as passed,
       count(*) filter (where not passed) as failed,
       count(*) as total
from app_test.results;

do $$
declare v_failed integer;
begin
  select count(*) into v_failed from app_test.results where not passed;
  if v_failed > 0 then raise exception 'scheduler: % assertion(s) failed', v_failed; end if;
end $$;
