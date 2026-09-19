# Cloud SQL Mirror — Notes & Status

## Architecture (as of 2026-09-01)

```
VPS backend ─────────────────────────────────────────────────────→ Supabase (source of truth)
GCP backend (kuasaprestij-api) → supabase-proxy → PostgREST → Cloud SQL kuasaprestij-dr
                                                                         ↑
                                                     nightly sync job (Cloud Scheduler, 2AM MYT)
```

- **VPS** is completely unchanged. Reads/writes Supabase directly.
- **GCP Cloud Run backend** reads/writes Cloud SQL, synced nightly from Supabase.
- Zero backend code changes required — `supabase-py` client works against PostgREST unchanged.

## GCP Services (project `prestij-alvin-spmexamsupport`, region `asia-southeast1`)

| Service | URL / Resource | Purpose |
|---|---|---|
| `kuasaprestij-api` | https://kuasaprestij-api-746801891568.asia-southeast1.run.app | FastAPI backend |
| `kuasaprestij-supabase-proxy` | https://kuasaprestij-supabase-proxy-746801891568.asia-southeast1.run.app | Path-rewrite proxy (`/rest/v1/*` → PostgREST `/`) |
| `kuasaprestij-postgrest` | https://kuasaprestij-postgrest-746801891568.asia-southeast1.run.app | PostgREST v12 REST layer over Cloud SQL |
| `kuasaprestij-migrate` (Job) | Cloud Run Job | Supabase→Cloud SQL full sync |
| `kuasaprestij-nightly-sync` | Cloud Scheduler `0 18 * * *` UTC | Triggers migrate job at 2 AM MYT |
| `kuasaprestij-dr` | Cloud SQL PostgreSQL 15 `10.103.0.3` | Primary GCP database (private IP only) |

## Secrets in Secret Manager

| Secret | Contains |
|---|---|
| `SUPABASE_URL` (v3) | `kuasaprestij-supabase-proxy` URL (GCP uses this, VPS uses its own `.env`) |
| `SUPABASE_KEY` (v2) | New JWT signed with `PGRST_JWT_SECRET` for GCP backend |
| `PGRST_JWT_SECRET` | JWT signing secret for PostgREST |
| `CLOUDSQL_DB_URI` | Full postgres connection string for Cloud SQL |
| `CLOUDSQL_PASSWORD` | Cloud SQL postgres password (`zVtpFcgAfkUW9ZZL`) |
| `CLOUDSQL_SUPABASE_KEY` | New GCP anon JWT (alias of SUPABASE_KEY v2) |

## Cloud SQL Instance

- Instance: `kuasaprestij-dr` (`prestij-alvin-spmexamsupport:asia-southeast1:kuasaprestij-dr`)
- Private IP: `10.103.0.3` (no public IP, org policy enforced)
- PostgreSQL 15.18 + pgvector
- VPC: `kuasaprestij-vpc`

## Migration status (2026-09-01)

- [x] Cloud SQL instance created with pgvector
- [x] Auth stub schema (`auth.users`, `auth.uid()`) for FK compatibility
- [x] All 26 tables migrated from Supabase REST API
- [x] 28,705 syllabus_embeddings rows with 768-dim vectors
- [x] 206,780 agent_traces rows
- [x] PostgREST deployed and connected to Cloud SQL
- [x] supabase-proxy deployed (path rewrite `/rest/v1/` → PostgREST `/`)
- [x] `kuasaprestij-api` updated to use proxy + new JWT
- [x] End-to-end `/start_session` test passed (real data from Cloud SQL)
- [x] Nightly Cloud Scheduler sync configured (2 AM MYT = 18:00 UTC)

## VPC Configuration

- `kuasaprestij-api` has `--vpc-egress=private-ranges-only` (VPC for private IPs, internet for LLM APIs)
- `kuasaprestij-postgrest` has VPC + Cloud SQL connector for private IP access
- `kuasaprestij-supabase-proxy` is public (`--allow-unauthenticated`) — protected by PostgREST JWT auth

## Notes

- `SUPABASE_URL` and `SUPABASE_KEY` secrets in GCP Secret Manager now point to Cloud SQL stack (NOT Supabase.io)
- VPS reads from its own `/root/kuasaprestij/.env` file — unaffected by Secret Manager changes
- PostgREST JWT secret is independent of Supabase's JWT secret (new key pair for GCP only)
- Supabase auth (`auth.users`) is stubbed in Cloud SQL — actual user auth still goes through Supabase.io
