-- API keys: a credential for the public REST API and the MCP server.
--
-- Specification section 15: "Scoped to a workspace, with a spend budget and an allow-list of
-- tools." All three are columns here rather than conventions.
--
-- The plaintext key is shown once, at creation, and never stored. What is stored is a SHA-256 hash
-- and a short non-secret prefix, so a customer can tell two keys apart in a list and in a log
-- without the list being a credential store.

create table public.api_keys (
  id                 uuid primary key default gen_random_uuid(),
  workspace_id       uuid not null references public.workspaces (id) on delete cascade,
  name               text not null check (length(btrim(name)) between 1 and 120),

  -- Non-secret display prefix, e.g. 'mp_live_a1b2c3d4'.
  key_prefix         text not null unique check (key_prefix ~ '^mp_(live|test)_[a-z0-9]{8}$'),
  -- SHA-256 of the full key. 32 bytes exactly; anything else is a bug in the minting path.
  key_hash           bytea not null unique check (octet_length(key_hash) = 32),

  -- Spend budget. Specification section 8 and 10.3 make cost predictability the top objection to
  -- credit pricing, so a key carries a hard ceiling rather than an alert.
  monthly_credit_budget integer check (monthly_credit_budget is null or monthly_credit_budget >= 0),
  credits_used          integer not null default 0 check (credits_used >= 0),
  budget_period_start   date not null default date_trunc('month', now())::date,

  -- Tool allow-list. Empty means every tool: a key with no restriction is the common case, and an
  -- empty array is easier to reason about than a null that means "all".
  allowed_tools      text[] not null default '{}',

  created_by         uuid references public.members (id) on delete set null,
  last_used_at       timestamptz,
  expires_at         timestamptz,
  revoked_at         timestamptz,
  created_at         timestamptz not null default now()
);

create index api_keys_workspace_idx on public.api_keys (workspace_id) where revoked_at is null;

comment on column public.api_keys.key_hash is
  'SHA-256 of the full key. The plaintext is shown once at creation and never stored.';
