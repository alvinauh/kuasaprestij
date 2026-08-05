# Cloud SQL Mirror — Notes & Status

> Goal (decided 2026-07-31): clone **all app data** out of Supabase into a GCP
> **Cloud SQL for PostgreSQL** instance, while **keeping Supabase live** as the
> source of truth. The Cloud SQL copy is a portability/backup mirror — kept
> **stopped when unused** so it costs ~storage only (~$1–3/mo).

## What is currently linked to what

```
VPS frontend/backend ─┐
                      ├─→  Supabase (opavfcpsxnntjylipbwl)  ← LIVE database, single source of truth
GCP frontend ─→ GCP backend ─┘
```

- **GCP frontend** (`kuasaprestij-frontend`, Cloud Run) has `VITE_API_BASE_URL` → the GCP backend.
- **GCP backend** (`kuasaprestij-api`, Cloud Run) authenticates to Supabase via `SUPABASE_KEY`
  (Secret Manager). It reads/writes the **same live Supabase DB** the VPS uses.
- Running the GCP frontend therefore operates on **real live data**, not a sandbox.
- The **Cloud SQL mirror is NOT wired to anything.** It is a standalone copy. It does not
  auto-update; nothing points at it. Refresh it by re-running the mirror script.

## GCP deployment (project `prestij-alvin-spmexamsupport`, region `asia-southeast1`)

| Thing | URL |
|---|---|
| Backend API (`kuasaprestij-api`) | https://kuasaprestij-api-746801891568.asia-southeast1.run.app |
| Frontend (`kuasaprestij-frontend`, parallel test) | https://kuasaprestij-frontend-746801891568.asia-southeast1.run.app |
| Cloud Run console | https://console.cloud.google.com/run?project=prestij-alvin-spmexamsupport |

## The mirror tool

`deploy/mirror_supabase_to_cloudsql.sh` — 4 + 2 steps, non-destructive to Supabase
(reads only). Dumps the **`public` schema only** (all 22 app tables incl. the pgvector
column on `syllabus_embeddings`). Supabase-managed schemas (`auth`, `storage`, `realtime`)
do NOT port — login accounts stay in Supabase, which is fine since Supabase stays live.

```bash
export SUPABASE_DB_URL='<session pooler URI with real password>'
./deploy/mirror_supabase_to_cloudsql.sh dump      # pull public schema -> ./supabase_public.dump
./deploy/mirror_supabase_to_cloudsql.sh instance  # create Cloud SQL (db-g1-small) — BILLABLE, one-time
export CLOUDSQL_PW='<printed by instance step>'
./deploy/mirror_supabase_to_cloudsql.sh restore    # enable pgvector + load dump (via Cloud SQL Proxy)
./deploy/mirror_supabase_to_cloudsql.sh verify      # row counts: Supabase vs Cloud SQL
./deploy/mirror_supabase_to_cloudsql.sh stop        # suspend -> compute $0, storage only
./deploy/mirror_supabase_to_cloudsql.sh start       #   resume when you need to query it
```

### Prereqs (already installed on the VPS 2026-07-31)
- `postgresql-client` (pg_dump/psql 16) — `apt-get install -y postgresql-client-15`
- `cloud-sql-proxy` v2.14.1 — `/usr/local/bin/cloud-sql-proxy`

### Connecting to Supabase for the dump
- Direct endpoint `db.<ref>.supabase.co:5432` is **IPv6-only**; from the VPS it returns
  "connection refused" on 5432 (IPv6:5432 appears firewalled) — do not rely on it.
- Use the **Session pooler** (IPv4): `postgresql://postgres.opavfcpsxnntjylipbwl:<PW>@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres`
- DB password ≠ `SUPABASE_KEY`. Reset at:
  `https://supabase.com/dashboard/project/opavfcpsxnntjylipbwl/settings/database`
  Resetting is safe for the app (app uses `SUPABASE_KEY`, not the DB password).

## Status — 2026-07-31

- [x] Decision: clone all data → Cloud SQL, keep Supabase live, stop instance when unused.
- [x] Mirror script written + tuned (`db-g1-small`, stop/start commands).
- [x] Client tools installed on VPS (pg_dump 16, cloud-sql-proxy 2.14.1).
- [ ] **BLOCKED: `dump` step** — Supabase DB password not yet authenticating on the pooler.
      Confirmed the DB is healthy and taking writes (via Management API). Next action: reset the
      DB password to a known value in the dashboard, then re-run `dump`.
- [ ] Create Cloud SQL instance (`instance`).
- [ ] Restore + verify (`restore`, `verify`).
- [ ] Stop instance (`stop`).

## Cost reminder
- `instance` creates a billable Cloud SQL resource. Kept **stopped**, it bills storage only
  (~$1–3/mo). While running: `db-g1-small` ≈ $25–35/mo.
- This is **additive** to Supabase billing — Supabase stays live.
