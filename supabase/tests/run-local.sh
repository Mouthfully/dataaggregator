#!/usr/bin/env bash
# Apply every migration to a scratch PostgreSQL database and run the RLS suite against it.
#
# `supabase start` needs Docker, which this environment does not have, and untested RLS is not
# worth much -- a policy that has never faced a hostile session is a comment. So this runs the real
# migrations, unmodified and in order, against a plain PostgreSQL 16 cluster, with 00_supabase_shim
# supplying the handful of objects a Supabase project would provide (the auth schema, the anon /
# authenticated / service_role roles, the extensions schema).
#
# What this does NOT cover, and where the real project still has to be checked: Supabase's own
# default privileges, GoTrue's actual JWT claim shape, Realtime, and anything storage-related.
#
# Usage:  PGHOST=/var/run/postgresql PGPORT=5433 ./supabase/tests/run-local.sh
set -euo pipefail

PGHOST="${PGHOST:-/var/run/postgresql}"
PGPORT="${PGPORT:-5433}"
PGUSER="${PGUSER:-postgres}"
DB="${DB:-rls_test}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"

psql() { command psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -v ON_ERROR_STOP=1 "$@"; }

echo "==> resetting $DB"
psql -d postgres -q -c "drop database if exists $DB;" -c "create database $DB;"

# ROLES ARE CLUSTER-LEVEL, AND DROPPING THE DATABASE DOES NOT TOUCH THEM.
#
# This was found by a mutation that should have failed and did not: deleting
# `grant app_ingest to authenticator` from a migration left the suite green, because the grant was
# still there from the PREVIOUS run. Every role below, and every membership between them, outlives
# `drop database` -- so without this the suite stops testing the migrations and starts testing the
# accumulated state of whoever's cluster it happens to run on. CI gets a fresh container and would
# have kept passing; a developer's machine would drift silently in the other direction.
#
# WHAT LEAKS IS THE MEMBERSHIPS, so those are revoked unconditionally and first. `grant app_ingest
# to authenticator` is the one the mutation exposed, and a revoke needs no cooperation from any
# other database: it is cluster state that this loop owns outright.
psql -d postgres -q -t -c "
  select format('revoke %I from %I;', r.rolname, m.rolname)
    from pg_auth_members am
    join pg_roles r on r.oid = am.roleid
    join pg_roles m on m.oid = am.member
   where r.rolname in ('app_ingest','app_scheduler','app_webhook','anon','authenticated','service_role');
" | psql -d postgres -q -f -

# Then drop the roles themselves, BEST EFFORT. This is the stronger reset -- it also catches a
# migration that stopped creating a role at all -- but `drop role` fails if the role holds
# privileges in ANY other database in the cluster, which this script has no way to clean and no
# business dropping. So a failure warns and continues rather than killing the run: the membership
# revoke above has already closed the leak that matters.
for role in app_ingest app_scheduler app_webhook authenticator anon authenticated service_role; do
  if ! psql -d postgres -q -c "drop role if exists $role;" 2>/dev/null; then
    printf '    WARNING: could not drop role %s (it holds privileges in another database).\n' "$role"
    printf '             Memberships were still revoked, so this run is sound.\n'
  fi
done

psql -d "$DB" -q -c "create extension if not exists pgcrypto;"

echo "==> shim"
psql -d "$DB" -q -f "$HERE/00_supabase_shim.sql"

echo "==> migrations"
for f in "$ROOT"/supabase/migrations/*.sql; do
  printf '    %-48s ' "$(basename "$f")"
  psql -d "$DB" -q -f "$f" && echo "ok"
done

echo "==> rls suite"
psql -d "$DB" -q -f "$HERE/01_rls_isolation.sql"

echo "==> scheduler suite"
psql -d "$DB" -q -f "$HERE/02_scheduler.sql"

echo "==> envelope store suite"
psql -d "$DB" -q -f "$HERE/03_envelope_store.sql"

echo "==> restatement outbox suite"
psql -d "$DB" -q -f "$HERE/04_restatement_events.sql"

echo "==> webhook delivery suite"
psql -d "$DB" -q -f "$HERE/05_webhook_delivery.sql"

echo "==> jwt claims suite"
psql -d "$DB" -q -f "$HERE/06_jwt_claims.sql"

echo "==> anon grants suite"
psql -d "$DB" -q -f "$HERE/07_anon_grants.sql"

echo "==> credential lane suite"
psql -d "$DB" -q -f "$HERE/08_credential_lane.sql"

echo "==> position suite"
psql -d "$DB" -q -f "$HERE/09_position.sql"

echo "==> ingest entry point suite"
psql -d "$DB" -q -f "$HERE/10_ingest_entry_point.sql"

echo "==> connection timezone suite"
psql -d "$DB" -q -f "$HERE/11_connection_timezone.sql"

echo "==> billing suite"
psql -d "$DB" -q -f "$HERE/12_billing.sql"

# 13 WAS WRITTEN AND NEVER WIRED IN. `20260912000800_scheduler_entry_point.sql` shipped with
# `13_scheduler_entry_point.sql` beside it and this runner was not amended, so the file has been
# sitting in the directory proving nothing -- the same failure the repository keeps finding, one
# layer up: a test nothing runs is indistinguishable from a test that passes. Wired in here
# rather than left for whoever notices next.
echo "==> scheduler entry point suite"
psql -d "$DB" -q -f "$HERE/13_scheduler_entry_point.sql"
