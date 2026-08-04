# Cloud Run deployment — KuasaPrestij backend

> Live as of 2026-07-30. Hybrid path (GCP compute + keep Supabase) per `GCP_MIGRATION_PLAN.md`.

## What's deployed
- **Service:** `kuasaprestij-api` on **Cloud Run**, project `prestij-alvin-spmexamsupport`, region `asia-southeast1`.
- **URL:** https://kuasaprestij-api-746801891568.asia-southeast1.run.app
- **Image:** built by Cloud Build from the repo-root `Dockerfile` (CPU torch + baked
  `paraphrase-multilingual-mpnet-base-v2` model; honors Cloud Run's `$PORT`).
- **Sizing:** `--memory 4Gi --cpu 2 --min-instances 0` (no idle cost; first request after
  scale-to-zero pays a cold start + one-time model load). Set `--min-instances 1` for always-warm.
- **Auth:** `--allow-unauthenticated` (app enforces its own Supabase-JWT auth on teacher/admin routes).
- **Database:** unchanged — talks to the same Supabase project `opavfcpsxnntjylipbwl`.

## Secrets (Secret Manager)
All 8 runtime keys are stored in **Secret Manager** and mounted as env vars via `valueFrom`
(no plaintext on the service):
`SUPABASE_URL, SUPABASE_KEY, SUPABASE_ACCESS_TOKEN, CEREBRAS_API_KEY, OPENROUTER_API_KEY,
GROQ_API_KEY, DEEPSEEK_API_KEY, PEXELS_API_KEY`.

- Runtime SA `746801891568-compute@developer.gserviceaccount.com` has `roles/secretmanager.secretAccessor`.
- **Rotate a key:** `gcloud secrets versions add <KEY> --data-file=- <<< "newvalue"` then redeploy
  (or `gcloud run services update kuasaprestij-api --region asia-southeast1 --update-secrets <KEY>=<KEY>:latest`).
- Telegram alerts are OFF (no `TELEGRAM_BOT_TOKEN`/`TELEGRAM_ADMIN_CHAT_ID` in `.env`); add as secrets to enable.

## IAM granted for source deploys
Compute default SA `746801891568-compute@developer.gserviceaccount.com` was granted:
`roles/cloudbuild.builds.builder`, `roles/storage.objectViewer`, `roles/artifactregistry.writer`,
`roles/logging.logWriter` (Cloud Build uses this SA to read source, build, push, and log).

## Redeploy (Level 1 — manual, works today)
```bash
./deploy/cloudrun_deploy.sh
```
Ships current local code; preserves existing secret bindings.

## CI/CD (Level 2 — not yet set up)
Push-to-deploy from GitHub (`alvinauh/kuasaprestij`) via a Cloud Build trigger. Blockers to resolve:
1. One-time interactive GitHub↔Cloud Build connection (console/OAuth).
2. Fat git history can't push to GitHub — build from the clean branch (`cleanup/pushable-base`),
   not `main`/local working branches.
