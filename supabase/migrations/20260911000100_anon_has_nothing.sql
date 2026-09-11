-- `anon` holds nothing in `public`, and keeps holding nothing as tables are added.
--
-- WHY THIS EXISTS, AND WHY IT IS NOT A DUPLICATE OF 20260908000700_rls.sql.
--
-- That migration ends with `revoke all on all tables in schema public from anon`. `ALL TABLES` is
-- resolved AT EXECUTION TIME, not as a standing rule, so it revoked from the seven tables that
-- existed in migration 0700 and said nothing about the three created afterwards --
-- `envelope_rows` and `restatement_events` in 1100, `webhook_endpoints` in 1200.
--
-- On a hosted project that gap is filled by Supabase, in the wrong direction. A project ships
-- `alter default privileges in schema public grant all on tables to anon, authenticated,
-- service_role`, so every new table in `public` arrives with `arwdDxtm` for `anon` -- insert,
-- select, update, delete, truncate, references, trigger, maintain. The anon key is public by
-- design; it ships in browsers.
--
-- OBSERVED, not theorised: on the first real project, `anon` held full DML on all three tables,
-- and `GET /rest/v1/envelope_rows` with the anon key returned 200. Row-level security is why it
-- returned `[]` rather than customer data -- every one of the three is ENABLE + FORCE with policies
-- scoped `to authenticated`. So nothing leaked. But the repository's posture for the other seven
-- tables is grant-revocation AND row-level security, deliberately, and these three had one layer
-- where the others have two. One `create policy ... to public` away from that mattering.
--
-- The local suite could not see it: a stock postgres:16 container has no such default privileges,
-- so `anon` held nothing locally and the assertion nobody had written would have passed anyway.
-- `00_supabase_shim.sql` now models the platform's default privileges, and `07_anon_grants.sql`
-- asserts the outcome per table rather than trusting either mechanism.
--
-- Two statements, because one without the other decays:
--   1. revoke what is already granted, for the tables that exist now;
--   2. change the default, so a table added by a future migration never receives the grant.
-- Statement 2 is what makes this the last time this file is needed.

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;

-- `authenticated` keeps exactly what 0700, 1100 and 1200 granted it: those are explicit per-table
-- grants, not defaults, so they are untouched by the lines above. Re-stated here rather than
-- assumed, because a revoke that quietly took a working grant with it would present as "every
-- authenticated read returns permission denied" and cost somebody an afternoon.
grant select on public.envelope_rows, public.restatement_events, public.webhook_endpoints
  to authenticated;
