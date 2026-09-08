-- Row-level security.
--
-- Specification section 15: strict tenant isolation enforced at the database row level, and "no
-- cross-workspace aggregation ever". Enforced here rather than in application code, because the
-- API edge, the dashboard's server actions and the scheduler are three different codebases in two
-- runtimes and a rule enforced in three places is a rule enforced in none.
--
-- FORCE ROW LEVEL SECURITY on every table, not merely ENABLE: without FORCE, the table owner
-- bypasses its own policies, and migrations run as the owner.

alter table public.organisations    enable row level security;
alter table public.workspaces       enable row level security;
alter table public.members          enable row level security;
alter table public.workspace_members enable row level security;
alter table public.invitations      enable row level security;
alter table public.connections      enable row level security;
alter table public.api_keys         enable row level security;

alter table public.organisations    force row level security;
alter table public.workspaces       force row level security;
alter table public.members          force row level security;
alter table public.workspace_members force row level security;
alter table public.invitations      force row level security;
alter table public.connections      force row level security;
alter table public.api_keys         force row level security;

-- ---------------------------------------------------------------------------------------------
-- Organisations
-- ---------------------------------------------------------------------------------------------

create policy organisations_select on public.organisations
  for select to authenticated
  using (deleted_at is null and app.is_org_member(id));

create policy organisations_update on public.organisations
  for update to authenticated
  using (deleted_at is null and app.is_org_admin(id))
  with check (app.is_org_admin(id));

-- Creation is not a policy. An INSERT here has no existing row to test membership against, so any
-- authenticated user could otherwise create an organisation naming anyone. Sign-up goes through a
-- SECURITY DEFINER function that creates the organisation and its first owner in one transaction;
-- see 20260908000900_signup.sql.

-- ---------------------------------------------------------------------------------------------
-- Workspaces
-- ---------------------------------------------------------------------------------------------

create policy workspaces_select on public.workspaces
  for select to authenticated
  using (deleted_at is null and app.can_read_workspace(id));

create policy workspaces_insert on public.workspaces
  for insert to authenticated
  with check (app.is_org_admin(organisation_id));

create policy workspaces_update on public.workspaces
  for update to authenticated
  using (deleted_at is null and app.is_org_admin(organisation_id))
  with check (app.is_org_admin(organisation_id));

-- ---------------------------------------------------------------------------------------------
-- Members
-- ---------------------------------------------------------------------------------------------
--
-- A member sees the roster of every organisation they belong to. Only admins change it, and the
-- WITH CHECK on update is what stops an admin re-pointing a row at a different organisation.

create policy members_select on public.members
  for select to authenticated
  using (app.is_org_member(organisation_id));

create policy members_insert on public.members
  for insert to authenticated
  with check (app.is_org_admin(organisation_id));

create policy members_update on public.members
  for update to authenticated
  using (app.is_org_admin(organisation_id))
  with check (app.is_org_admin(organisation_id));

create policy members_delete on public.members
  for delete to authenticated
  using (app.is_org_admin(organisation_id));

-- ---------------------------------------------------------------------------------------------
-- Workspace members
-- ---------------------------------------------------------------------------------------------

create policy workspace_members_select on public.workspace_members
  for select to authenticated
  using (app.can_read_workspace(workspace_id));

create policy workspace_members_insert on public.workspace_members
  for insert to authenticated
  with check (
    exists (
      select 1 from public.workspaces w
      where w.id = workspace_id and app.is_org_admin(w.organisation_id)
    )
  );

create policy workspace_members_delete on public.workspace_members
  for delete to authenticated
  using (
    exists (
      select 1 from public.workspaces w
      where w.id = workspace_id and app.is_org_admin(w.organisation_id)
    )
  );

-- ---------------------------------------------------------------------------------------------
-- Invitations
-- ---------------------------------------------------------------------------------------------
--
-- Admins only, in both directions. An invitation names an email address and a role, so a viewer
-- who could read the table would learn who is being hired.

create policy invitations_select on public.invitations
  for select to authenticated
  using (app.is_org_admin(organisation_id));

create policy invitations_insert on public.invitations
  for insert to authenticated
  with check (app.is_org_admin(organisation_id));

create policy invitations_update on public.invitations
  for update to authenticated
  using (app.is_org_admin(organisation_id))
  with check (app.is_org_admin(organisation_id));

-- Accepting an invitation is deliberately NOT a policy: the accepting user is by definition not
-- yet a member, so no membership test can authorise them. It goes through a SECURITY DEFINER
-- function that takes the token.

-- ---------------------------------------------------------------------------------------------
-- Connections
-- ---------------------------------------------------------------------------------------------
--
-- Readable by anyone who can read the workspace, INCLUDING an API-key session, because the
-- scheduler needs the ciphertext to do its job. Reading a row yields nothing usable without the
-- KEK, which lives in Cloudflare.
--
-- Writes are humans only: app.can_write_workspace() requires a user id, so a stolen API key cannot
-- re-point a connection at an attacker's account.

create policy connections_select on public.connections
  for select to authenticated
  using (app.can_read_workspace(workspace_id));

create policy connections_insert on public.connections
  for insert to authenticated
  with check (app.can_write_workspace(workspace_id));

create policy connections_update on public.connections
  for update to authenticated
  using (app.can_write_workspace(workspace_id))
  with check (app.can_write_workspace(workspace_id));

create policy connections_delete on public.connections
  for delete to authenticated
  using (
    exists (
      select 1 from public.workspaces w
      where w.id = workspace_id and app.is_org_admin(w.organisation_id)
    )
  );

-- ---------------------------------------------------------------------------------------------
-- API keys
-- ---------------------------------------------------------------------------------------------
--
-- Admins only, and note what is NOT here: no policy grants an API-key session any access to this
-- table. A key cannot enumerate, mint or revoke keys -- not even its own row. Verification goes
-- through the SECURITY DEFINER function in the next migration, which returns only what the edge
-- needs and never the hash.

create policy api_keys_select on public.api_keys
  for select to authenticated
  using (
    app.current_user_id() is not null
    and exists (
      select 1 from public.workspaces w
      where w.id = workspace_id and app.is_org_admin(w.organisation_id)
    )
  );

create policy api_keys_insert on public.api_keys
  for insert to authenticated
  with check (
    app.current_user_id() is not null
    and exists (
      select 1 from public.workspaces w
      where w.id = workspace_id and app.is_org_admin(w.organisation_id)
    )
  );

create policy api_keys_update on public.api_keys
  for update to authenticated
  using (
    app.current_user_id() is not null
    and exists (
      select 1 from public.workspaces w
      where w.id = workspace_id and app.is_org_admin(w.organisation_id)
    )
  )
  with check (
    app.current_user_id() is not null
    and exists (
      select 1 from public.workspaces w
      where w.id = workspace_id and app.is_org_admin(w.organisation_id)
    )
  );

-- ---------------------------------------------------------------------------------------------
-- Table privileges
-- ---------------------------------------------------------------------------------------------
--
-- RLS filters rows; it does not grant access to a table. Supabase's default privileges hand
-- `anon` and `authenticated` broad rights on everything in `public`, which means the isolation
-- above rests on a project setting rather than on this schema. These statements make the grants
-- explicit and self-contained, so the schema is correct wherever it is applied.
--
-- `anon` gets NOTHING. There is no unauthenticated surface: the public no-signup demo endpoint in
-- specification section 10.3 is served by the edge from materialised data, not by a browser
-- reading these tables. The single exception is verify_api_key(), granted in the previous
-- migration, which is a function and returns no table row.

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

grant select on public.organisations, public.workspaces, public.members,
                 public.workspace_members, public.invitations,
                 public.connections, public.api_keys
  to authenticated;

grant insert, update on public.organisations, public.workspaces, public.members,
                        public.workspace_members, public.invitations,
                        public.connections, public.api_keys
  to authenticated;

grant delete on public.members, public.workspace_members, public.connections
  to authenticated;

-- Deliberately no DELETE on organisations, workspaces, invitations or api_keys. Each is retired by
-- setting deleted_at or revoked_at, because a hard delete of an organisation destroys the audit
-- log and the Meta client-list record along with it, and a deleted API key is one nobody can prove
-- was ever used.
