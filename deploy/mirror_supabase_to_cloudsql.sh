#!/usr/bin/env bash
# Mirror the Supabase `public` schema (tables + data + pgvector) into a GCP
# Cloud SQL for PostgreSQL instance.
#
# NON-DESTRUCTIVE to Supabase: this only READS from Supabase (pg_dump) and
# WRITES into Cloud SQL. Supabase stays the live source of truth; this stands
# up a parallel GCP-hosted copy.
#
# NOTE ON SCOPE: we dump ONLY the `public` schema. Supabase's own schemas
# (auth, storage, realtime, extensions, graphql, ...) and roles are NOT
# portable to Cloud SQL and are intentionally excluded. Auth / RLS / Realtime /
# Storage therefore stay on Supabase — this mirrors DATA only, per the
# "full move but maintain on Supabase" decision.
#
# PREREQS on this box:
#   - gcloud (authed as ipgm-2284@moe-dl.edu.my, project prestij-alvin-spmexamsupport)
#   - postgresql-client v15+  (pg_dump/psql)  ->  apt-get install -y postgresql-client
#
# USAGE:
#   export SUPABASE_DB_URL='postgresql://postgres:<PW>@db.opavfcpsxnntjylipbwl.supabase.co:5432/postgres'
#   ./deploy/mirror_supabase_to_cloudsql.sh dump      # 1. pull public schema -> ./supabase_public.dump
#   ./deploy/mirror_supabase_to_cloudsql.sh instance  # 2. create Cloud SQL instance (billable, one-time)
#   ./deploy/mirror_supabase_to_cloudsql.sh restore    # 3. enable pgvector + load the dump
#   ./deploy/mirror_supabase_to_cloudsql.sh verify     # 4. row counts side-by-side
#   ./deploy/mirror_supabase_to_cloudsql.sh stop        # 5. suspend -> compute $0, storage only
#   ./deploy/mirror_supabase_to_cloudsql.sh start       #    resume when you need to query it
set -euo pipefail

export PATH="/root/google-cloud-sdk/bin:$PATH"

PROJECT="prestij-alvin-spmexamsupport"
REGION="asia-southeast1"
INSTANCE="kuasaprestij-pg"
DB="kuasaprestij"
TIER="db-g1-small"               # shared 1 vCPU / 1.7 GB — cheap; instance is STOPPED when unused
PG_VERSION="POSTGRES_15"
DUMP="./supabase_public.dump"
CLOUDSQL_PW="${CLOUDSQL_PW:-}"    # postgres user pw for the new instance; auto-set on `instance`

cmd="${1:-help}"

case "$cmd" in
  dump)
    : "${SUPABASE_DB_URL:?set SUPABASE_DB_URL to the Supabase Postgres URI (dashboard > Settings > Database)}"
    echo ">> Dumping public schema from Supabase (custom format, no owners/privs)..."
    pg_dump "$SUPABASE_DB_URL" \
      --schema=public \
      --no-owner --no-privileges --no-comments \
      --format=custom \
      --file="$DUMP"
    echo ">> Wrote $DUMP ($(du -h "$DUMP" | cut -f1))"
    ;;

  instance)
    echo ">> Creating Cloud SQL instance $INSTANCE ($TIER, $PG_VERSION, $REGION)..."
    gcloud sql instances create "$INSTANCE" \
      --project="$PROJECT" --region="$REGION" \
      --database-version="$PG_VERSION" --tier="$TIER" \
      --storage-auto-increase --edition=ENTERPRISE
    echo ">> Setting postgres password (save this!)..."
    if [ -z "$CLOUDSQL_PW" ]; then CLOUDSQL_PW="$(openssl rand -base64 18)"; fi
    gcloud sql users set-password postgres --instance="$INSTANCE" \
      --project="$PROJECT" --password="$CLOUDSQL_PW"
    gcloud sql databases create "$DB" --instance="$INSTANCE" --project="$PROJECT"
    echo ">> postgres password: $CLOUDSQL_PW   (store in Secret Manager)"
    echo ">> Re-run with:  export CLOUDSQL_PW='$CLOUDSQL_PW'"
    ;;

  restore)
    : "${CLOUDSQL_PW:?set CLOUDSQL_PW (printed by the 'instance' step)}"
    [ -f "$DUMP" ] || { echo "missing $DUMP — run 'dump' first"; exit 1; }
    echo ">> Opening Cloud SQL Auth Proxy on 127.0.0.1:5433..."
    CONN="$(gcloud sql instances describe "$INSTANCE" --project="$PROJECT" --format='value(connectionName)')"
    cloud-sql-proxy "$CONN" --port 5433 & PROXY=$!
    trap 'kill $PROXY 2>/dev/null || true' EXIT
    sleep 6
    LOCAL="postgresql://postgres:${CLOUDSQL_PW}@127.0.0.1:5433/${DB}"
    echo ">> Enabling pgvector..."
    psql "$LOCAL" -c 'CREATE EXTENSION IF NOT EXISTS vector;'
    echo ">> Restoring dump..."
    pg_restore --no-owner --no-privileges --dbname="$LOCAL" "$DUMP"
    echo ">> Restore complete."
    ;;

  verify)
    : "${SUPABASE_DB_URL:?}"; : "${CLOUDSQL_PW:?}"
    CONN="$(gcloud sql instances describe "$INSTANCE" --project="$PROJECT" --format='value(connectionName)')"
    cloud-sql-proxy "$CONN" --port 5433 & PROXY=$!
    trap 'kill $PROXY 2>/dev/null || true' EXIT
    sleep 6
    Q="select relname, n_live_tup from pg_stat_user_tables order by relname;"
    echo "=== SUPABASE ==="; psql "$SUPABASE_DB_URL" -c "$Q"
    echo "=== CLOUD SQL ==="; psql "postgresql://postgres:${CLOUDSQL_PW}@127.0.0.1:5433/${DB}" -c "$Q"
    ;;

  stop)
    echo ">> Suspending $INSTANCE (compute billing stops; storage still billed)..."
    gcloud sql instances patch "$INSTANCE" --project="$PROJECT" --activation-policy=NEVER
    echo ">> Stopped. To resume:  ./deploy/mirror_supabase_to_cloudsql.sh start"
    ;;

  start)
    echo ">> Resuming $INSTANCE..."
    gcloud sql instances patch "$INSTANCE" --project="$PROJECT" --activation-policy=ALWAYS
    ;;

  *)
    grep '^#' "$0" | sed 's/^# \{0,1\}//'
    ;;
esac
