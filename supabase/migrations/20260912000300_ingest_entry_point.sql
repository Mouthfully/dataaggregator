-- The ingest entry point: how a Worker writes an envelope row at all.
--
-- THE PROBLEM THIS SOLVES. `app.upsert_envelope_row` has existed since 20260908001100 and nothing
-- has ever called it, because nothing CAN. Every piece of the path is closed:
--
--   * The function lives in schema `app`, and supabase/config.toml exposes only `public` to
--     PostgREST -- deliberately: "the tenancy helpers in `app` are a privilege boundary, not an
--     API".
--   * PostgREST is the Worker's ONLY database transport. There is no Hyperdrive binding, no
--     Postgres driver anywhere in the monorepo, and no service-role key.
--   * `app_ingest` is NOLOGIN and nothing grants it to `authenticator`, so PostgREST cannot assume
--     it even if it were asked to. (Verified against the live project: `authenticator` exists and
--     is not a member of `app_ingest`.)
--
-- So `/v1/performance` returns an empty array and always will, because `envelope_rows` is empty and
-- there is no way to fill it.
--
-- WHY A FORWARDER IN `public` AND NOT THE OBVIOUS ALTERNATIVES.
--
-- REJECTED: listing `app` in config.toml's exposed schemas. 20260908000100_extensions.sql already
-- grants USAGE on schema `app` to `authenticated`, so exposing it makes every function in `app`
-- addressable by any tenant with a valid token, leaving per-function ACLs as the only barrier --
-- and PostgreSQL grants EXECUTE on a NEW function to PUBLIC by default, which
-- 20260912000200_position.sql documents as an incident that already happened here once. One
-- forgotten revoke in a future migration would then be a tenant-reachable write.
--
-- REJECTED FOR NOW: a direct connection through Hyperdrive. It remains the deferred answer for the
-- webhook drain, which has this identical problem and currently answers it by refusing
-- (apps/api-edge/src/index.ts passes `store: null` and says so). Introducing a second database
-- transport to ship the first write is a larger change than the write.
--
-- THE HONEST COST, stated rather than discovered in review: this makes SUPABASE_JWT_SECRET a WRITE
-- credential and not only a read one. Anything that can mint a token can now reach this function.
-- That is precisely what Hyperdrive would later fix, and it is why the grant below is as narrow as
-- it is.
--
-- SECURITY INVOKER, DELIBERATELY. `app.upsert_envelope_row` is already SECURITY DEFINER, so it is
-- the thing that reaches the table; this wrapper does not need to be, and making it DEFINER would
-- widen the blast radius of a future mistake here for no benefit. The tenant invariant therefore
-- holds THREE DEEP: a tenant cannot execute this wrapper (revoked below), cannot execute the `app`
-- function (revoked in its own migration), and holds no write grant and no write policy on
-- `public.envelope_rows`.

-- ---------------------------------------------------------------------------------------------
-- PostgREST must be able to assume the ingest role.
--
-- `authenticator` is the login role PostgREST connects as; it serves a request by SET LOCAL ROLE to
-- whatever the token's `role` claim names. That only works for a role it is a MEMBER of. Nothing
-- grants any role to `authenticator` in this schema today -- Supabase does it for anon,
-- authenticated and service_role at project creation, and `app_ingest` is ours.
--
-- Guarded on existence because `authenticator` is a Supabase-provided role: it is present on a real
-- project and absent from a plain PostgreSQL cluster unless the shim creates it. Without this
-- grant, PostgREST fails the SET ROLE and the error surfaces as a rejected token, which sends
-- whoever hits it looking at the signing secret rather than at role membership.
-- ---------------------------------------------------------------------------------------------
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'authenticator') then
    grant app_ingest to authenticator;
  end if;
end $$;

-- ---------------------------------------------------------------------------------------------
-- The forwarder.
--
-- A BATCH, NOT ONE ROW PER CALL, and the reason is WooCommerce. That connector emits one envelope
-- row per ORDER, so a per-row RPC is one HTTPS round trip per order -- a modest shop's week is
-- thousands of requests inside a single Worker invocation's CPU allotment.
-- docs/marketplane/15-envelope-store.md left "one row per call" open "pending a Worker to measure
-- against"; this is that Worker, and a connector written against a per-row port is the expensive
-- thing to undo later, not the function.
--
-- THE THREE ENUM PARAMETERS ARE TAKEN AS `text` AND CAST IN THE BODY. `app.envelope_source`,
-- `app.entity_type` and `app.attribution_window` are declared in a schema PostgREST cannot see, and
-- packages/store/src/authenticator.ts already carries a warning about what that does: a type
-- PostgREST cannot resolve comes back as an unexpanded record literal rather than an object. Taking
-- text and casting here keeps every type in this function's signature resolvable from `public`, and
-- an invalid value still fails -- as a cast error naming the value, which is a better diagnostic
-- than a silent coercion.
--
-- Returns the count written, so a caller can assert that what it sent is what landed rather than
-- trusting a 204.
-- ---------------------------------------------------------------------------------------------
create function public.ingest_envelope_rows(p_rows jsonb)
returns integer
language plpgsql
volatile
security invoker
set search_path = public, pg_temp
as $fn$
declare
  r         jsonb;
  v_written integer := 0;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'ingest_envelope_rows: p_rows must be a json array, got %',
      coalesce(jsonb_typeof(p_rows), 'null');
  end if;

  for r in select * from jsonb_array_elements(p_rows)
  loop
    perform app.upsert_envelope_row(
      p_workspace_id       => (r ->> 'workspace_id')::uuid,
      p_connection_id      => (r ->> 'connection_id')::uuid,
      p_source             => (r ->> 'source')::app.envelope_source,
      p_account_id         => r ->> 'account_id',
      p_entity_id          => r ->> 'entity_id',
      p_entity_type        => (r ->> 'entity_type')::app.entity_type,
      p_native_entity_type => r ->> 'native_entity_type',
      p_native_id          => r ->> 'native_id',
      p_date               => (r ->> 'date')::date,
      p_currency           => r ->> 'currency',
      p_timezone           => r ->> 'timezone',
      p_attribution_window => (r ->> 'attribution_window')::app.attribution_window,
      p_fetched_at         => (r ->> 'fetched_at')::timestamptz,
      p_first_seen_at      => (r ->> 'first_seen_at')::timestamptz,
      p_restates_until     => (r ->> 'restates_until')::timestamptz,
      p_source_updated_at  => (r ->> 'source_updated_at')::timestamptz,
      p_entity_name        => r ->> 'entity_name',
      p_parent_id          => r ->> 'parent_id',
      p_spend              => (r ->> 'spend')::numeric,
      p_impressions        => (r ->> 'impressions')::numeric,
      p_clicks             => (r ->> 'clicks')::numeric,
      p_sessions           => (r ->> 'sessions')::numeric,
      p_conversions        => (r ->> 'conversions')::numeric,
      p_conversions_value  => (r ->> 'conversions_value')::numeric,
      p_revenue            => (r ->> 'revenue')::numeric,
      p_orders             => (r ->> 'orders')::numeric,
      p_net_revenue        => (r ->> 'net_revenue')::numeric,
      p_fees               => (r ->> 'fees')::numeric,
      p_commission         => (r ->> 'commission')::numeric,
      -- APPENDED BY 20260912000200_position.sql, and the reason this list is written out in full
      -- rather than generated. An adapter built against the 34-argument signature would drop
      -- `position` on every row forever, with nothing failing -- which is the exact defect that
      -- migration's own drop-and-recreate existed to prevent one layer down.
      p_position           => (r ->> 'position')::numeric,
      p_fx_source          => r ->> 'fx_source',
      p_fx_rate_date       => (r ->> 'fx_rate_date')::date,
      p_fx_rate            => (r ->> 'fx_rate')::numeric,
      p_fx_base            => r ->> 'fx_base',
      p_raw_key            => r ->> 'raw_key'
    );
    v_written := v_written + 1;
  end loop;

  return v_written;
end;
$fn$;

-- ---------------------------------------------------------------------------------------------
-- THE REVOKE, WHICH IS THE WHOLE SECURITY PROPERTY.
--
-- PostgreSQL's BUILT-IN default ACL grants EXECUTE on a new function to PUBLIC, and `alter default
-- privileges` cannot revoke it -- 20260911000200_credits_need_the_key.sql establishes this by
-- experiment and 20260912000200_position.sql records an incident where omitting exactly these two
-- statements made three assertions in 03_envelope_store.sql fail with "POLICY BYPASS".
--
-- So without the line below, this function would be executable by `anon` -- and the anon key is
-- public by design, it ships in browsers. Every tenant, and the internet, could write arbitrary
-- rows into any workspace's envelope_rows, which is the one thing the whole ingest design exists to
-- prevent: these rows are derived platform data, and a tenant able to forge them can fabricate the
-- numbers the product's guarantee rests on.
-- ---------------------------------------------------------------------------------------------
revoke all on function public.ingest_envelope_rows(jsonb) from public, anon, authenticated;
grant execute on function public.ingest_envelope_rows(jsonb) to app_ingest;

comment on function public.ingest_envelope_rows(jsonb) is
  'The ingest entry point. Forwards a json array to app.upsert_envelope_row, which PostgREST cannot '
  'reach because schema `app` is deliberately unexposed. SECURITY INVOKER: the inner function is '
  'the SECURITY DEFINER one. Executable ONLY by app_ingest -- a tenant able to call this could '
  'fabricate the numbers the product guarantees. supabase/tests/07_anon_grants.sql fails if it ever '
  'becomes anon-executable.';
