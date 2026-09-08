-- Sign-up and invitation acceptance.
--
-- Both are SECURITY DEFINER functions rather than RLS policies, for the same reason: at the moment
-- they run, the caller is not yet a member of anything, so there is no membership for a policy to
-- test. An INSERT policy permissive enough to allow either would be permissive enough to let any
-- authenticated user write rows into someone else's organisation.

-- Create an organisation, its first workspace, and the caller as owner, in one transaction.
create or replace function public.create_organisation(
  p_name text,
  p_slug text,
  p_workspace_name text default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := app.current_user_id();
  v_org_id uuid;
  v_member_id uuid;
begin
  if v_user_id is null then
    raise exception 'create_organisation: no authenticated user'
      using errcode = '42501';
  end if;

  insert into public.organisations (name, slug)
  values (p_name, p_slug)
  returning id into v_org_id;

  insert into public.members (organisation_id, user_id, role)
  values (v_org_id, v_user_id, 'owner')
  returning id into v_member_id;

  -- Section 15's first screen is "create an organisation, then the first workspace", so the
  -- workspace is created here rather than leaving a new account with nowhere to connect anything.
  if p_workspace_name is not null then
    insert into public.workspaces (organisation_id, name, slug)
    values (v_org_id, p_workspace_name, p_slug);
  end if;

  return v_org_id;
end;
$$;

revoke all on function public.create_organisation(text, text, text) from public, anon;
grant execute on function public.create_organisation(text, text, text) to authenticated;

-- Accept an invitation by presenting its token.
--
-- The caller supplies the token hash; the plaintext token never reaches the database, exactly as
-- for API keys. Expiry, revocation and prior acceptance are all checked here rather than trusted
-- from the caller.
create or replace function public.accept_invitation(p_token_hash bytea)
returns uuid
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := app.current_user_id();
  v_invitation public.invitations;
  v_member_id uuid;
  v_workspace_id uuid;
begin
  if v_user_id is null then
    raise exception 'accept_invitation: no authenticated user' using errcode = '42501';
  end if;
  if p_token_hash is null or octet_length(p_token_hash) <> 32 then
    raise exception 'accept_invitation: malformed token' using errcode = '22023';
  end if;

  select * into v_invitation
  from public.invitations
  where token_hash = p_token_hash
    and accepted_at is null
    and revoked_at is null
    and expires_at > now()
  for update;

  if v_invitation.id is null then
    raise exception 'accept_invitation: invitation not found, already used, revoked or expired'
      using errcode = '22023';
  end if;

  -- Idempotent on re-acceptance, and it does not silently downgrade someone who is already a
  -- member at a higher role.
  insert into public.members (organisation_id, user_id, role)
  values (v_invitation.organisation_id, v_user_id, v_invitation.role)
  on conflict (organisation_id, user_id) do update
    set updated_at = now()
  returning id into v_member_id;

  foreach v_workspace_id in array v_invitation.workspace_ids loop
    -- Only grant workspaces that still exist in the inviting organisation. An invitation issued
    -- before a workspace moved or was deleted must not resurrect access to it.
    insert into public.workspace_members (workspace_id, member_id)
    select v_workspace_id, v_member_id
    from public.workspaces w
    where w.id = v_workspace_id
      and w.organisation_id = v_invitation.organisation_id
      and w.deleted_at is null
    on conflict (workspace_id, member_id) do nothing;
  end loop;

  update public.invitations
     set accepted_at = now(), accepted_by = v_user_id
   where id = v_invitation.id;

  return v_invitation.organisation_id;
end;
$$;

revoke all on function public.accept_invitation(bytea) from public, anon;
grant execute on function public.accept_invitation(bytea) to authenticated;
