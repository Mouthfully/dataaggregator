-- The account model from specification section 15.
--
--   Organisation  the paying company; owns billing, credits, keys, connections, the entity graph
--   Workspace     one client or brand inside an organisation
--   Member        a person with a login, holding an organisation-level role
--   Workspace member  an explicit per-workspace grant
--
-- The last table is not in section 15 and is added deliberately. Section 15 says agencies "need one
-- login across many client accounts with per-client isolation", and Meta Platform Terms 5.b.ii.2
-- requires per-Client separation of Platform Data. An organisation-level role alone cannot express
-- "this analyst sees three of our forty clients", so isolation would stop at the organisation
-- boundary, which is the wrong boundary.

create type app.member_role as enum ('owner', 'admin', 'analyst', 'viewer');

create table public.organisations (
  id              uuid primary key default gen_random_uuid(),
  name            text not null check (length(btrim(name)) between 1 and 200),
  slug            text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$'),
  -- Where this organisation's data is held. Null until provisioned; see
  -- docs/marketplane/01-brand-identity.md for why the value is not assumed.
  data_region     text check (data_region is null or data_region in ('eu-central-1', 'us-east-1', 'ap-southeast-1')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);

create table public.workspaces (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  name            text not null check (length(btrim(name)) between 1 and 200),
  slug            text not null check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$'),
  -- The Meta client-list obligation (specification 3.5, 5.b.ii.2) is a standing record, not a
  -- launch-day scramble: a workspace IS a client, and these are the fields Meta asks for.
  client_name     text,
  client_contact  text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  unique (organisation_id, slug)
);

create table public.members (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  user_id         uuid not null references auth.users (id) on delete cascade,
  role            app.member_role not null default 'viewer',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organisation_id, user_id)
);

-- Owners and admins reach every workspace in their organisation implicitly. Analysts and viewers
-- reach only what is granted here. That asymmetry is the whole point: it is what lets an agency put
-- forty clients in one organisation without every seat seeing all forty.
create table public.workspace_members (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces (id) on delete cascade,
  member_id       uuid not null references public.members (id) on delete cascade,
  created_at      timestamptz not null default now(),
  unique (workspace_id, member_id)
);

create index members_user_idx on public.members (user_id);
create index members_org_idx on public.members (organisation_id);
create index workspaces_org_idx on public.workspaces (organisation_id) where deleted_at is null;
create index workspace_members_member_idx on public.workspace_members (member_id);
create index workspace_members_workspace_idx on public.workspace_members (workspace_id);
