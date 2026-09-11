-- JWT claim resolution tests.
--
-- THIS FILE EXISTS BECAUSE THE REST OF THE SUITE CANNOT ASK THIS QUESTION.
--
-- Every other test here sets `request.jwt.claim.sub` by hand and then checks that a policy built on
-- `app.current_user_id()` behaves. That proves the policies are right. It proves nothing at all
-- about whether a real PostgREST sets the GUC the helper reads, because the test and the helper
-- share the same assumption -- the suite was testing the helpers against itself.
--
-- Issue #9: PostgREST before 9 exposed one GUC per claim (`request.jwt.claim.sub`); current
-- PostgREST exposes the claims as a single JSON object (`request.jwt.claims`). If the helpers read
-- only the form a project does not set, they return NULL, every RLS predicate evaluates false, and
-- every authenticated read returns ZERO ROWS -- silently. The helpers now coalesce over both forms,
-- and this file pins both, plus the precedence between them and the isolation that must survive
-- either.
--
-- What this still does not settle: WHICH form this product's eventual Supabase project sets. That
-- needs one query against a live project. The point of the coalesce is that the answer stops
-- mattering, and the point of this file is that the JSON path is no longer merely assumed to work.

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
-- Fixture. Its own organisation and its own user, so this file does not depend on another file
-- having run first, and so a count assertion below means "exactly mine" rather than "some rows".
-- ---------------------------------------------------------------------------------------------

insert into auth.users (id, email) values
  ('e0000000-0000-4000-8000-000000000001', 'erin@claims.test')
on conflict do nothing;

insert into public.organisations (id, name, slug) values
  ('e1000000-0000-4000-8000-000000000001', 'Claims Org', 'claims-org')
on conflict do nothing;

insert into public.workspaces (id, organisation_id, name, slug) values
  ('e2000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000001', 'Claims Workspace', 'claims-workspace')
on conflict do nothing;

insert into public.members (id, organisation_id, user_id, role) values
  ('e3000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 'owner')
on conflict do nothing;

-- ---------------------------------------------------------------------------------------------
-- The helpers resolve a claim from EITHER GUC form.
--
-- Assertion 2 and assertion 4 are the ones that could not be made before: they are the live
-- PostgREST shape, and nothing in the suite had ever exercised them.
-- ---------------------------------------------------------------------------------------------
begin;
  select set_config('request.jwt.claim.sub', 'e0000000-0000-4000-8000-000000000001', true);
  select set_config('request.jwt.claims', '', true);

  select app_test.check('current_user_id resolves from the per-claim GUC',
    app.current_user_id() = 'e0000000-0000-4000-8000-000000000001'::uuid);
commit;

begin;
  select set_config('request.jwt.claim.sub', '', true);
  select set_config('request.jwt.claims',
    '{"sub":"e0000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

  select app_test.check('current_user_id resolves from the claims JSON object',
    app.current_user_id() = 'e0000000-0000-4000-8000-000000000001'::uuid);
commit;

begin;
  select set_config('request.jwt.claim.workspace_id', 'e2000000-0000-4000-8000-000000000001', true);
  select set_config('request.jwt.claims', '', true);

  select app_test.check('api_key_workspace_id resolves from the per-claim GUC',
    app.api_key_workspace_id() = 'e2000000-0000-4000-8000-000000000001'::uuid);
commit;

begin;
  select set_config('request.jwt.claim.workspace_id', '', true);
  select set_config('request.jwt.claims',
    '{"workspace_id":"e2000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

  select app_test.check('api_key_workspace_id resolves from the claims JSON object',
    app.api_key_workspace_id() = 'e2000000-0000-4000-8000-000000000001'::uuid);
commit;

-- ---------------------------------------------------------------------------------------------
-- Precedence, absence and a claims object that carries no identity.
--
-- The precedence is asserted rather than left to chance because it is the difference between the
-- existing suite continuing to mean what it says and it silently reading a different claim.
-- ---------------------------------------------------------------------------------------------
begin;
  select set_config('request.jwt.claim.sub', 'e0000000-0000-4000-8000-000000000001', true);
  select set_config('request.jwt.claims',
    '{"sub":"11111111-1111-1111-1111-111111111111"}', true);

  select app_test.check('the per-claim GUC wins when both forms are present',
    app.current_user_id() = 'e0000000-0000-4000-8000-000000000001'::uuid);
commit;

begin;
  select set_config('request.jwt.claim.sub', '', true);
  select set_config('request.jwt.claim.workspace_id', '', true);
  select set_config('request.jwt.claims', '', true);

  select app_test.check('no claim in either form is no identity, not a default one',
    app.current_user_id() is null and app.api_key_workspace_id() is null);
commit;

begin;
  select set_config('request.jwt.claim.sub', '', true);
  select set_config('request.jwt.claim.workspace_id', '', true);
  -- An anonymous PostgREST request still carries a claims object; it simply has no subject.
  select set_config('request.jwt.claims', '{"role":"anon"}', true);

  select app_test.check('a claims object without a subject grants no identity',
    app.current_user_id() is null and app.api_key_workspace_id() is null);
commit;

-- ---------------------------------------------------------------------------------------------
-- The defect itself: an authenticated read through the claims-JSON form only.
--
-- The four assertions above prove the helpers return a uuid. These prove the thing issue #9 is
-- actually about -- that a session whose claims arrive ONLY as JSON reads its own rows instead of
-- receiving a silent empty result. Every one of these runs as `authenticated`, because the owner
-- and any superuser bypass RLS and would pass trivially.
-- ---------------------------------------------------------------------------------------------
begin;
  set local role authenticated;
  select set_config('request.jwt.claim.sub', '', true);
  select set_config('request.jwt.claim.workspace_id', '', true);
  select set_config('request.jwt.claims',
    '{"sub":"e0000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

  select app_test.check('a claims-JSON session reads its own workspace rather than zero rows',
    (select count(*) = 1 from public.workspaces
      where id = 'e2000000-0000-4000-8000-000000000001'));

  select app_test.check('a claims-JSON session sees its own organisation',
    (select count(*) = 1 from public.organisations
      where id = 'e1000000-0000-4000-8000-000000000001'));

  -- Reading a second GUC must not widen what a session can reach. If coalescing had been written
  -- as "any identity in either form", this is where that would show.
  select app_test.check('a claims-JSON session still cannot reach another organisation',
    (select count(*) = 0 from public.organisations
      where id <> 'e1000000-0000-4000-8000-000000000001'));
commit;

begin;
  set local role authenticated;
  select set_config('request.jwt.claim.sub', '', true);
  select set_config('request.jwt.claim.workspace_id', '', true);
  select set_config('request.jwt.claims',
    '{"workspace_id":"e2000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

  select app_test.check('a claims-JSON API-key session reads its bound workspace',
    (select count(*) = 1 from public.workspaces
      where id = 'e2000000-0000-4000-8000-000000000001'));

  select app_test.check('a claims-JSON API-key session reads no workspace it is not bound to',
    (select count(*) = 0 from public.workspaces
      where id <> 'e2000000-0000-4000-8000-000000000001'));
commit;

-- ---------------------------------------------------------------------------------------------
-- Summary
--
-- THE COUNT IS ASSERTED, NOT JUST PRINTED. Each block above ends in `commit`, not `rollback`,
-- because `app_test.check()` records its verdict by INSERTING a row -- a rolled-back block
-- discards its own evidence and the file reports "0 passed, 0 failed" as though it were success.
-- That is how this file first ran. The floor below is what stops it happening silently again: a
-- block that stops executing takes the total with it, and the run fails.
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
  if v_failed > 0 then raise exception 'jwt claims: % assertion(s) failed', v_failed; end if;
  if v_total < 12 then
    raise exception 'jwt claims: only % assertion(s) ran; expected at least 12', v_total;
  end if;
end $$;
