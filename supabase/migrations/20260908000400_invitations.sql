-- Invitations.
--
-- The token is never stored. Only its SHA-256 hash is, exactly as for API keys: a database dump
-- must not hand the reader a working invitation to an organisation.

create table public.invitations (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  email           text not null check (email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  role            app.member_role not null default 'viewer',
  -- Workspaces this invitation grants on acceptance. Empty for owner and admin, who reach every
  -- workspace implicitly.
  workspace_ids   uuid[] not null default '{}',
  token_hash      bytea not null unique,
  invited_by      uuid references public.members (id) on delete set null,
  expires_at      timestamptz not null,
  accepted_at     timestamptz,
  accepted_by     uuid references auth.users (id) on delete set null,
  revoked_at      timestamptz,
  created_at      timestamptz not null default now(),
  -- An invitation is either open, accepted or revoked, never two at once.
  check (accepted_at is null or revoked_at is null)
);

-- One open invitation per address per organisation. Partial, so a re-invite after acceptance or
-- revocation is allowed.
create unique index invitations_open_unique
  on public.invitations (organisation_id, lower(email))
  where accepted_at is null and revoked_at is null;

create index invitations_org_idx on public.invitations (organisation_id);
