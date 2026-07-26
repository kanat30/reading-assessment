#!/usr/bin/env bash
#
# Hermetic test harness for recalculate_session_metrics (the word-level override
# recompute — the FluencyScope trust linchpin).
#
# Spins up a THROWAWAY PostgreSQL cluster in a temp dir, loads the real function
# verbatim from migration 0019, runs supabase/tests/recompute_metrics.test.sql, and
# tears everything down. It never touches your existing clusters or any real database,
# needs no running server, and leaves nothing behind. Exit code reflects pass/fail.
#
# Requires a local PostgreSQL install (Homebrew postgresql@16 or @14). CI-ready.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Locate a Postgres bin dir (prefer newest). Fall back to whatever is on PATH.
PGBIN=""
for v in 17 16 15 14; do
  if [ -x "/opt/homebrew/opt/postgresql@$v/bin/initdb" ]; then
    PGBIN="/opt/homebrew/opt/postgresql@$v/bin"; break
  fi
done
if [ -z "$PGBIN" ]; then
  if command -v initdb >/dev/null 2>&1; then
    PGBIN="$(dirname "$(command -v initdb)")"
  else
    echo "✗ No PostgreSQL install found (need initdb). On macOS: brew install postgresql@16" >&2
    exit 127
  fi
fi

CLUSTER="$(mktemp -d "${TMPDIR:-/tmp}/fs-recompute.XXXXXX")"
DATA="$CLUSTER/data"
SOCK="$CLUSTER/sock"
PORT=54329   # unique; the server also only listens on the private socket below

cleanup() {
  "$PGBIN/pg_ctl" -D "$DATA" -s -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$CLUSTER"
}
trap cleanup EXIT

mkdir -p "$SOCK"
"$PGBIN/initdb" -D "$DATA" -U postgres --auth=trust >/dev/null
# Socket-only server (no TCP) so it can never collide with a real local Postgres.
"$PGBIN/pg_ctl" -D "$DATA" -w -s \
  -o "-k $SOCK -p $PORT -c listen_addresses=''" start >/dev/null

PSQL=("$PGBIN/psql" -h "$SOCK" -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -q)

# Load the real function at its current definition (0019, then 0022 which supersedes
# it) — verbatim, so the suite can never drift from what runs in production.
echo "▸ recompute suite (real 0019→0022 function, throwaway PG $("$PGBIN/postgres" --version | awk '{print $3}'))"
"${PSQL[@]}" -f "$ROOT/supabase/tests/_setup.sql" >/dev/null
"${PSQL[@]}" -f "$ROOT/supabase/migrations/0019_exclude_unreached_from_recompute.sql" >/dev/null
"${PSQL[@]}" -f "$ROOT/supabase/migrations/0022_align_recompute_cutoff_to_gap_tail.sql" >/dev/null
# -o /dev/null drops the (void) query-result tables; the PASS/FAIL NOTICEs go to stderr.
"${PSQL[@]}" -o /dev/null -f "$ROOT/supabase/tests/recompute_metrics.test.sql"

# ── tenancy self-verification: prove the 0022 guard aborts on a regression ──────
# Stand up the full tenancy stack (wrapper + RLS) so 0022's gated checks run, then
# confirm: (positive) it passes when tenancy is intact; (negatives) it ABORTS when RLS
# is disabled or when the wrapper loses its per-school check.
echo "▸ tenancy self-verification (0022 guard)"
MIG="$ROOT/supabase/migrations/0022_align_recompute_cutoff_to_gap_tail.sql"
"${PSQL[@]}" -f "$ROOT/supabase/tests/_tenancy_fixture.sql" >/dev/null

if "${PSQL[@]}" -o /dev/null -f "$MIG" 2>&1 | grep -q 'Tenancy verified'; then
  echo "  ✓ full-path verification passes when tenancy is intact"
else
  echo "  ✗ FAIL: verification did not confirm intact tenancy"; exit 1
fi

"${PSQL[@]}" -c "ALTER TABLE session_events DISABLE ROW LEVEL SECURITY;" >/dev/null
if "${PSQL[@]}" -o /dev/null -f "$MIG" >/dev/null 2>&1; then
  echo "  ✗ FAIL: migration did NOT abort with RLS disabled on session_events"; exit 1
fi
echo "  ✓ aborts when RLS is disabled on a session table"
"${PSQL[@]}" -c "ALTER TABLE session_events ENABLE ROW LEVEL SECURITY;" >/dev/null

# Wrapper loses its per-school guard -> must abort.
"${PSQL[@]}" -c "CREATE OR REPLACE FUNCTION apply_event_override() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS \$\$ BEGIN RAISE NOTICE 'no tenancy guard'; END \$\$;" >/dev/null
if "${PSQL[@]}" -o /dev/null -f "$MIG" >/dev/null 2>&1; then
  echo "  ✗ FAIL: migration did NOT abort when apply_event_override dropped the school check"; exit 1
fi
echo "  ✓ aborts when the wrapper drops the per-school check"

echo "✓ recompute suite passed"
