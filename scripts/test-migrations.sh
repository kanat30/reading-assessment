#!/usr/bin/env bash
#
# Hermetic harness for migrations 0023-0025 (student_grade, the prosody-
# dimension override path in apply_session_override, and the ungraded
# comprehension status).
#
# Spins up a THROWAWAY PostgreSQL cluster, stands up the production tables +
# RLS policies the migrations' catalog-driven guards assert (see
# supabase/tests/_override_setup.sql), loads the REAL migration files
# verbatim, runs the behavioral suite (multi-tenancy rejection, strict
# field-path validation, no phantom override rows, CHECK constraints), and
# then proves each migration's self-verification ABORTS on a tenancy
# regression. Never touches a real database. Exit code reflects pass/fail.
#
# Requires a local PostgreSQL install (Homebrew postgresql@16 or @14). CI-ready.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

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

CLUSTER="$(mktemp -d "${TMPDIR:-/tmp}/fs-migrations.XXXXXX")"
DATA="$CLUSTER/data"
SOCK="$CLUSTER/sock"
PORT=54331   # unique; socket-only server below

cleanup() {
  "$PGBIN/pg_ctl" -D "$DATA" -s -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$CLUSTER"
}
trap cleanup EXIT

mkdir -p "$SOCK"
"$PGBIN/initdb" -D "$DATA" -U postgres --auth=trust >/dev/null
"$PGBIN/pg_ctl" -D "$DATA" -w -s \
  -o "-k $SOCK -p $PORT -c listen_addresses=''" start >/dev/null

PSQL=("$PGBIN/psql" -h "$SOCK" -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -q)

M23="$ROOT/supabase/migrations/0023_assessment_student_grade.sql"
M24="$ROOT/supabase/migrations/0024_override_prosody_dimensions.sql"
M25="$ROOT/supabase/migrations/0025_comprehension_ungraded_status.sql"

echo "▸ migrations 0023-0025 suite (real files, throwaway PG $("$PGBIN/postgres" --version | awk '{print $3}'))"

# Production-shaped schema + RLS + policies, then the real migrations in order.
"${PSQL[@]}" -f "$ROOT/supabase/tests/_override_setup.sql" >/dev/null
"${PSQL[@]}" -o /dev/null -f "$M23" 2> >(grep -E 'NOTICE' >&2 || true)
"${PSQL[@]}" -o /dev/null -f "$M24" 2> >(grep -E 'NOTICE' >&2 || true)
"${PSQL[@]}" -o /dev/null -f "$M25" 2> >(grep -E 'NOTICE' >&2 || true)

# Behavioral scenarios (PASS/FAIL notices go to stderr; failures abort).
"${PSQL[@]}" -o /dev/null -f "$ROOT/supabase/tests/session_override.test.sql"

# ── negative guards: each migration must ABORT on a tenancy regression ──────
echo "▸ tenancy-guard negatives (each re-apply must abort)"

"${PSQL[@]}" -c "ALTER TABLE session_overrides DISABLE ROW LEVEL SECURITY;" >/dev/null
if "${PSQL[@]}" -o /dev/null -f "$M24" >/dev/null 2>&1; then
  echo "  ✗ FAIL: 0024 did NOT abort with RLS disabled on session_overrides"; exit 1
fi
echo "  ✓ 0024 aborts when RLS is disabled on session_overrides"
"${PSQL[@]}" -c "ALTER TABLE session_overrides ENABLE ROW LEVEL SECURITY;" >/dev/null

"${PSQL[@]}" -c "DROP POLICY \"teachers can insert overrides for sessions in their school\" ON session_overrides; DROP POLICY \"teachers can read overrides for sessions in their school\" ON session_overrides;" >/dev/null
if "${PSQL[@]}" -o /dev/null -f "$M24" >/dev/null 2>&1; then
  echo "  ✗ FAIL: 0024 did NOT abort with the school-scoped policies dropped"; exit 1
fi
echo "  ✓ 0024 aborts when session_overrides loses its school-scoped policies"
"${PSQL[@]}" -c "
CREATE POLICY \"teachers can read overrides for sessions in their school\" ON session_overrides
  FOR SELECT USING (session_id IN (SELECT s.id FROM sessions s JOIN assessments a ON s.assessment_id = a.id WHERE a.school_id = current_teacher_school_id()));
CREATE POLICY \"teachers can insert overrides for sessions in their school\" ON session_overrides
  FOR INSERT WITH CHECK (teacher_id = (SELECT id FROM teachers WHERE auth_provider_id = auth.uid()) AND session_id IN (SELECT s.id FROM sessions s JOIN assessments a ON s.assessment_id = a.id WHERE a.school_id = current_teacher_school_id()));
" >/dev/null

"${PSQL[@]}" -c "CREATE POLICY wide_open_writes ON assessments FOR UPDATE USING (true);" >/dev/null
if "${PSQL[@]}" -o /dev/null -f "$M23" >/dev/null 2>&1; then
  echo "  ✗ FAIL: 0023 did NOT abort with a wide-open write policy on assessments"; exit 1
fi
echo "  ✓ 0023 aborts when assessments gains a wide-open write policy"
"${PSQL[@]}" -c "DROP POLICY wide_open_writes ON assessments;" >/dev/null

"${PSQL[@]}" -c "DROP POLICY comprehension_answers_teacher_read ON comprehension_answers;" >/dev/null
if "${PSQL[@]}" -o /dev/null -f "$M25" >/dev/null 2>&1; then
  echo "  ✗ FAIL: 0025 did NOT abort with the teacher read policy dropped"; exit 1
fi
echo "  ✓ 0025 aborts when comprehension_answers loses its school-scoped read"

echo "✓ migrations 0023-0025: behavioral + tenancy-guard suites passed"
