-- Extensions.
--
-- pgcrypto gives gen_random_uuid() and digest(); the API-key design needs the latter to hash a
-- presented key without the plaintext ever being stored.

create extension if not exists pgcrypto with schema extensions;

-- Everything the application owns lives in `app`, never in `public`. PostgREST exposes `public`,
-- so a helper accidentally created there would become a callable RPC.
create schema if not exists app;

revoke all on schema app from public, anon, authenticated;
grant usage on schema app to authenticated, service_role;
