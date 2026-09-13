#!/usr/bin/env bash
#
# THE WHOLE GATE, IN ONE COMMAND, WITH EXIT CODES THAT ARE ACTUALLY THE COMMAND'S.
#
# `.github/workflows` runs eleven checks as eleven steps, and until now there was no way to run
# the same set locally except by typing them. Everyone typed their own loop, and the loops were
# wrong in a way that is invisible:
#
#     for f in scripts/check-*.mjs; do node "$f"; echo "$(basename $f)=$?"; done
#
# THAT REPORTS 0 FOR EVERY GUARD, INCLUDING THE FAILING ONES. `$(basename $f)` is a command
# substitution: it runs, and it sets `$?` to ITS OWN status -- which is 0 -- before the `$?`
# later in the same word is expanded. The loop is not reporting the guard. It is reporting
# `basename`. It prints eight zeroes over a failing tree and looks exactly like a clean run.
#
# That is this repository's own thesis turned on its tooling: a wrong number that looks right is
# worse than no number, because it is trusted precisely when someone is being careful. It has
# already cost one red CI run -- a `biome format` failure on a file added AFTER the last format
# check, waved through by a loop that could not have reported it.
#
# So the rule this file exists to enforce is mechanical rather than remembered: `rc=$?` is the
# statement IMMEDIATELY after the command, always, and the label is computed before the command
# runs. Nothing is allowed between them, and `run()` is the only place a check is invoked.
#
# WHAT IT DOES NOT DO. It does not fix anything, and it takes no `--write` flag. A gate that can
# repair what it measures is a gate you stop reading. It also stops at nothing: every check runs
# even after one fails, because the useful output is the whole row of results, not the first
# thing to break.
#
# The SQL suite is NOT run here. `supabase/tests/run-local.sh` needs a live PostgreSQL that this
# script has no business starting or assuming, and silently skipping it would be a gate that
# reports green while the half of the system that enforces tenancy went unchecked. Run it
# yourself; the summary below says so rather than leaving the gap unmentioned.
#
#   usage:  ./scripts/gate.sh            every check
#           ./scripts/gate.sh --guards   only the check-*.mjs guards (seconds, not minutes)
#
# Exits 0 only when every check it ran exited 0.

set -u

cd "$(dirname "$0")/.." || exit 2
LOGS="${GATE_LOGS:-.gate-logs}"
mkdir -p "$LOGS" || exit 2

guards_only=0
[ "${1:-}" = "--guards" ] && guards_only=1

failed=()

# run <label> <command...>
#
# The one place a check is invoked. `rc=$?` is the next statement after "$@" and nothing may come
# between them -- not an echo, not a test, and above all not a command substitution.
run() {
  local label="$1"
  shift
  "$@" >"$LOGS/$label.log" 2>&1
  local rc=$?
  if [ "$rc" -eq 0 ]; then
    printf '  %-26s ok\n' "$label"
  else
    printf '  %-26s FAILED (exit %d)  %s\n' "$label" "$rc" "$LOGS/$label.log"
    failed+=("$label")
  fi
}

echo "gate"

for guard in scripts/check-*.mjs; do
  # The label is computed HERE, before the command runs, for the reason in the header.
  label="$(basename "$guard" .mjs)"
  run "$label" node "$guard"
done

if [ "$guards_only" -eq 0 ]; then
  # `biome lint` and `biome format` and NOT `biome check`: CI runs these two, and `check` also
  # enforces import organisation, which CI does not. A local gate stricter than CI teaches people
  # to ignore it; one looser than CI is the thing this file exists to prevent.
  run biome-lint npx biome lint .
  run biome-format npx biome format .
  run typecheck pnpm -r typecheck
  run test pnpm -r test
fi

echo
if [ "${#failed[@]}" -eq 0 ]; then
  echo "  PASS -- every check exited 0; logs in $LOGS"
  echo "  note: the SQL suite is NOT part of this. Run supabase/tests/run-local.sh against a live"
  echo "        PostgreSQL -- tenancy is enforced there and nowhere else."
  exit 0
fi

echo "  FAIL -- ${#failed[@]} of the checks did not exit 0: ${failed[*]}"
exit 1
