#!/usr/bin/env bash
# Runs inside Cloud Run Job.
# Connects to Supabase via direct Postgres (IPv6, works from GCP).
# Applies schema + syncs data to Cloud SQL via unix socket.
set -euo pipefail

SUPABASE_HOST="db.opavfcpsxnntjylipbwl.supabase.co"
SUPABASE_PORT="5432"
SUPABASE_USER="postgres"
SUPABASE_DB="postgres"

CLOUDSQL_SOCKET_DIR="/cloudsql/prestij-alvin-spmexamsupport:asia-southeast1:kuasaprestij-dr"
CLOUDSQL_USER="postgres"
CLOUDSQL_DB="kuasaprestij"

log() { echo "[$(date -u '+%H:%M:%S')] $*"; }

# ── 1. Apply schema ────────────────────────────────────────────────────────────
log "Applying schema to Cloud SQL..."
PGPASSWORD="$CLOUDSQL_PASSWORD" psql \
  -h "$CLOUDSQL_SOCKET_DIR" \
  -U "$CLOUDSQL_USER" \
  -d "$CLOUDSQL_DB" \
  -f /app/schema.sql 2>&1 | tail -20
log "Schema applied."

# ── 2. Dump public schema data from Supabase (skip syllabus_embeddings — too large for pg_dump, done separately) ──
TABLES=(
  profiles students topic_anchors dskp_mastery event_logs media_cache
  quiz_sessions chat_history generated_lessons quizzes assigned_tasks
  remediation_plans game_scores user_feedback classroom_members classrooms
  assignments agent_traces student_daily_report teacher_chat
  feedback_quality_audit app_errors
  rph_documents aita_games aita_game_assignments aita_game_scores rph_shares
)

log "Dumping and restoring tables from Supabase..."
for TABLE in "${TABLES[@]}"; do
  log "  Syncing $TABLE..."
  PGPASSWORD="$SUPABASE_PASSWORD" pg_dump \
    -h "$SUPABASE_HOST" -p "$SUPABASE_PORT" \
    -U "$SUPABASE_USER" -d "$SUPABASE_DB" \
    --data-only --no-owner --no-acl \
    --disable-triggers \
    -t "public.$TABLE" 2>/dev/null \
  | PGPASSWORD="$CLOUDSQL_PASSWORD" psql \
      -h "$CLOUDSQL_SOCKET_DIR" \
      -U "$CLOUDSQL_USER" \
      -d "$CLOUDSQL_DB" \
      --set ON_ERROR_STOP=off \
      2>&1 | grep -v "^$" | grep -v "SET\|COPY\|--" | head -5 || true
done

# ── 3. syllabus_embeddings — dump in one shot (28K vector rows) ────────────────
log "Syncing syllabus_embeddings (28k rows with vectors)..."
PGPASSWORD="$SUPABASE_PASSWORD" pg_dump \
  -h "$SUPABASE_HOST" -p "$SUPABASE_PORT" \
  -U "$SUPABASE_USER" -d "$SUPABASE_DB" \
  --data-only --no-owner --no-acl \
  --disable-triggers \
  -t "public.syllabus_embeddings" \
| PGPASSWORD="$CLOUDSQL_PASSWORD" psql \
    -h "$CLOUDSQL_SOCKET_DIR" \
    -U "$CLOUDSQL_USER" \
    -d "$CLOUDSQL_DB" \
    --set ON_ERROR_STOP=off \
    2>&1 | tail -3

log "Migration complete."
