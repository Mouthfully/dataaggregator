-- Tenancy helpers.
--
-- DECISION (gap 1 in docs/marketplane/00-repo-map.md section 10): tenancy resolves through a
-- MEMBERSHIP-TABLE JOIN, not through JWT custom claims.
--
-- Custom claims are faster -- no subquery per policy evaluation -- and they are the wrong choice
-- here. A claim is a snapshot: remove someone from a workspace and their existing token keeps
-- working until it expires. For a product whose pitch is tenant isolation, and which is bound by
-- Meta Platform Terms 5.b.ii.2 on per-Client separation, "revoked but still reading for another
-- fifty minutes" is not an acceptable window. The join is always current.
--
-- The cost is bounded and paid for: every lookup below is a single indexed read, marked STABLE so
-- the planner evaluates it once per statement rather than once per row. If profiling later shows
-- this is the bottleneck, the fix is a claims cache with explicit invalidation, not a silent
-- switch to snapshot semantics.
--
-- Every function here is SECURITY DEFINER for one specific reason: a policy on `members` that
-- queries `members` recurses infinitely. SECURITY DEFINER runs the lookup as the owner, outside
-- RLS, which breaks the cycle. That makes each of these a privilege boundary, so each one pins
-- `search_path` -- without it a caller can create a shadowing `public.members` and capture the
-- function's privileges.

-- BOTH CLAIM GUCS ARE READ, AND THE ORDER IS NOT ARBITRARY.
--
-- PostgREST before version 9 exposed each JWT claim as its own GUC -- `request.jwt.claim.sub`.
-- Current PostgREST exposes the claims as one JSON object in `request.jwt.claims`, and Supabase's
-- own documentation is internally inconsistent about which of the two a project actually sets.
-- That inconsistency is precisely why Supabase's shipped `auth.uid()` coalesces over both rather
-- than trusting either, and these functions now do the same thing for the same reason.
--
-- THE FAILURE THIS PREVENTS IS SILENT. Every RLS policy in 20260908000700_rls.sql is built on
-- these two functions. If the only form a project sets is the one a function does not read, the
-- function returns NULL, every predicate evaluates false, and every authenticated read returns
-- ZERO ROWS -- not an error a customer can report, an empty result they mistake for lost data.
-- Reading both forms makes the helpers correct on either PostgREST without knowing which is live.
--
-- The singular GUC is read FIRST so that the shape the RLS suite has always exercised keeps
-- winning where both are present; `06_jwt_claims.sql` pins that precedence, and pins the JSON
-- path the suite could not previously reach.
--
-- A malformed `request.jwt.claims` raises on the ::jsonb cast rather than resolving to NULL. That
-- is deliberate and matches `auth.uid()`: a claims object PostgREST could not build is a broken
-- session, and an error names it where a null would re-create the silent denial above.

-- The human behind the request, or null for an API-key session.
create or replace function app.current_user_id()
returns uuid
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
  )::uuid;
$$;

-- The workspace an API-key session is bound to, or null for a human session.
--
-- The API edge mints a short-lived token carrying this claim after verifying a key; see
-- 20260908000800_api_key_verification.sql. A key is bound to exactly one workspace, so this claim
-- is the entire authority of that session.
create or replace function app.api_key_workspace_id()
returns uuid
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.workspace_id', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'workspace_id'
  )::uuid;
$$;

-- The caller's role in an organisation, or null if they are not a member.
create or replace function app.org_role(p_organisation_id uuid)
returns app.member_role
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select m.role
  from public.members m
  where m.organisation_id = p_organisation_id
    and m.user_id = app.current_user_id()
  limit 1;
$$;

create or replace function app.is_org_member(p_organisation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select app.org_role(p_organisation_id) is not null;
$$;

-- Owners and admins administer; analysts and viewers do not.
create or replace function app.is_org_admin(p_organisation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select app.org_role(p_organisation_id) in ('owner', 'admin');
$$;

-- Can the caller READ this workspace?
--
-- Three principals, and each is checked explicitly rather than falling through:
--   1. an API-key session bound to exactly this workspace
--   2. an owner or admin of the workspace's organisation, implicitly
--   3. an analyst or viewer with an explicit grant in workspace_members
--
-- A deleted workspace or organisation is invisible to everyone. Soft-deleted rows staying readable
-- is the usual way "delete my data" quietly fails to mean anything.
create or replace function app.can_read_workspace(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.workspaces w
    join public.organisations o on o.id = w.organisation_id
    where w.id = p_workspace_id
      and w.deleted_at is null
      and o.deleted_at is null
      and (
        p_workspace_id = app.api_key_workspace_id()
        or app.org_role(w.organisation_id) in ('owner', 'admin')
        or exists (
          select 1
          from public.workspace_members wm
          join public.members m on m.id = wm.member_id
          where wm.workspace_id = w.id
            and m.user_id = app.current_user_id()
        )
      )
  );
$$;

-- Can the caller WRITE in this workspace?
--
-- Deliberately narrower than reading: a viewer reads and an API key reads. An API key never writes
-- tenancy rows -- specification section 15 scopes a key to data access with a spend budget and a
-- tool allow-list, not to administering the account it belongs to. A stolen key must not be able to
-- invite a member or re-point a connection.
create or replace function app.can_write_workspace(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select app.current_user_id() is not null
     and exists (
       select 1
       from public.workspaces w
       join public.organisations o on o.id = w.organisation_id
       where w.id = p_workspace_id
         and w.deleted_at is null
         and o.deleted_at is null
         and (
           app.org_role(w.organisation_id) in ('owner', 'admin')
           or (
             app.org_role(w.organisation_id) = 'analyst'
             and exists (
               select 1
               from public.workspace_members wm
               join public.members m on m.id = wm.member_id
               where wm.workspace_id = w.id
                 and m.user_id = app.current_user_id()
             )
           )
         )
     );
$$;

revoke all on function
  app.org_role(uuid), app.is_org_member(uuid), app.is_org_admin(uuid),
  app.can_read_workspace(uuid), app.can_write_workspace(uuid)
from public, anon;

grant execute on function
  app.org_role(uuid), app.is_org_member(uuid), app.is_org_admin(uuid),
  app.can_read_workspace(uuid), app.can_write_workspace(uuid)
to authenticated;
