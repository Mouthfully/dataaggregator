-- Connections: one authorised platform account inside a workspace.
--
-- DECISION (gap 3 in docs/marketplane/00-repo-map.md section 10): the customer's OAuth grants are
-- held under ENVELOPE ENCRYPTION with the key encryption key OUTSIDE the database, not in Supabase
-- Vault.
--
-- Vault is simpler, and it puts the key material next to the ciphertext: one database compromise
-- yields both. What this product sells is custody of other people's platform credentials, so the
-- database must be worth nothing on its own.
--
-- The scheme:
--   * a fresh 256-bit data encryption key (DEK) per connection, per rotation
--   * the credential is AES-256-GCM sealed under that DEK
--   * the DEK is itself sealed under a key encryption key (KEK) held in Cloudflare, and only the
--     wrapped form is stored here
--   * Postgres never sees a plaintext credential, a plaintext DEK, or the KEK
--
-- Decryption happens in the Worker via WebCrypto, which is also the only place that needs it: the
-- scheduler calls platform APIs, Postgres never does. `key_version` exists so a KEK rotation is a
-- re-wrap of DEKs rather than a re-encryption of every credential.
--
-- Specification non-negotiable 4 forbids shared platform tokens across tenants. That is structural
-- here, not a rule to remember: a credential hangs off exactly one workspace and has its own DEK.

create type app.connection_provider as enum (
  'google_ads', 'ga4', 'search_console', 'meta_ads',
  'impact', 'awin', 'cj', 'partnerstack',
  -- KEY-PASTE, and the first of its kind here. Appended, never inserted: Postgres orders an enum by
  -- definition order. A WooCommerce connection holds a merchant-issued consumer key and secret, has
  -- no authorisation server behind it, and NEVER EXPIRES -- `expires_at` is null and means "no
  -- expiry" rather than "unknown". See KEY_PASTE_PROVIDERS in packages/connections.
  --
  -- NOTE FOR WHOEVER ADDS THE NEXT ONE: no guard relates this enum to its TypeScript twin.
  -- check-dictionary.mjs covers sources, entity types, attribution windows and metrics -- NOT
  -- connection providers. Adding a member here and forgetting the other side fails at runtime, not
  -- at build time, which is the failure mode that guard exists to prevent everywhere else. New
  -- providers append because this enum will be persisted and its ordering must remain stable.
  'woocommerce',
  'stripe'
);

create type app.connection_status as enum ('active', 'needs_reauth', 'revoked', 'error');

create table public.connections (
  id                    uuid primary key default gen_random_uuid(),
  workspace_id          uuid not null references public.workspaces (id) on delete cascade,
  provider              app.connection_provider not null,

  -- The platform's own account identifier, e.g. a Google Ads customer ID. Not a secret.
  external_account_id   text not null,
  display_name          text,

  -- Envelope-encrypted credential. Opaque here by design; only the Worker can open it.
  credential_ciphertext bytea not null,
  credential_iv         bytea not null,
  wrapped_dek           bytea not null,
  key_version           integer not null default 1,

  -- Scopes the customer actually granted, so a missing scope is diagnosed rather than guessed at
  -- from a 403.
  granted_scopes        text[] not null default '{}',
  expires_at            timestamptz,

  status                app.connection_status not null default 'active',
  last_health_check_at  timestamptz,
  last_error            text,

  -- Quota consumption, surfaced in the dashboard per specification section 15. Google Ads limits
  -- are per developer token (Explorer 2,880/day, Basic 15,000/day), so this is the tenant's share
  -- of a shared ceiling, not an independent budget.
  quota_used_today      integer not null default 0 check (quota_used_today >= 0),
  quota_window_start    date,

  -- Restatement schedule (specification section 7): daily for D-0..D-3, weekly to the platform's
  -- window. Held per connection because the window is per platform and per account.
  restatement_window_days integer check (restatement_window_days is null or restatement_window_days between 0 and 400),
  last_backfill_at      timestamptz,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  revoked_at            timestamptz,

  -- One connection per platform account per workspace. Two workspaces MAY hold the same external
  -- account -- an agency and its client can each connect it -- and each gets its own grant and its
  -- own DEK, which is what per-tenant custody means.
  unique (workspace_id, provider, external_account_id)
);

create index connections_workspace_idx on public.connections (workspace_id) where revoked_at is null;
create index connections_due_backfill_idx on public.connections (last_backfill_at)
  where status = 'active' and revoked_at is null;

comment on column public.connections.credential_ciphertext is
  'AES-256-GCM ciphertext. The database is not a party to this value; the KEK lives in Cloudflare.';

-- OPEN QUESTION, specification section 3.5: "If every tenant brings their own developer token,
-- whose token appears in the request?" No source answers it. This column encodes an answer nothing
-- confirms -- that a tenant may supply its own Google Ads developer token, wrapped the same way as
-- any other credential. Flagged in the design note; revisit before the Google Ads connector ships.
alter table public.connections
  add column developer_token_ciphertext bytea,
  add column developer_token_iv bytea,
  add column developer_token_wrapped_dek bytea;
