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
