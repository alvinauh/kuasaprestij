# GCP_MIGRATION_PLAN.md — Migrating KuasaPrestij to Google Cloud Platform

> Status: **planning**. Created 2026-07-27. Maps the current VPS-hosted stack to GCP, with a
> recommended **hybrid** path (move compute to GCP, keep Supabase) and a **full-GCP** option
> (only if getting off Supabase is a hard requirement — it's a large lift).

---

## 0. Current stack (what we're moving)

| Layer | Today | Notes |
|---|---|---|
| Backend API | FastAPI + LangGraph, `uvicorn app.main:app` on a **VPS** (systemd, :8001) | stateless HTTP |
| Public entry | nginx + **cloudflared** tunnel → `api.kuasa.tech:8443` | 443 owned by another app on the box |
| Embeddings | **local `sentence-transformers`** `paraphrase-multilingual-mpnet-base-v2` (768-dim, BM/EN/ZH) | pulls torch/CUDA — venv is ~5.5 GB |
| LLM | Cerebras → OpenRouter → Groq → DeepSeek (**external APIs**) | no GPU needed for LLM |
| Database | **Supabase** (Postgres + pgvector, Auth, RLS, Realtime, Storage, PostgREST) | app leans on ALL of these |
| Media / TTS | `edge-tts` (in-process), Pexels (external), audio in **Supabase Storage** | |
| Telemetry | `agent_traces` table (Supabase) + Telegram alerts | |
| Frontend | TanStack Start (Vite SSR), currently `vite dev` on VPS :3000; build targets **Cloudflare Workers** | see WORKSPACE.md essay-timeout root cause |

**Key facts that shape the migration:**
- The app is **deeply coupled to Supabase** — Auth (JWT), **RLS policies** (incl. the new
  `profiles_update_student_by_teacher`), Realtime (classroom updates), Storage (TTS audio),
  PostgREST (frontend writes prefs directly). Replacing Supabase means rebuilding all of these.
- Embeddings run a **PyTorch model locally**. That's the one component with real cold-start /
  image-size weight on serverless.
- Repo history is too fat to push to GitHub (see `project_git_github_state` memory) — CI/CD must
  build from the **clean branch** `cleanup/pushable-base`, not the fat history.

---

## 1. Recommended path — **Hybrid** (GCP compute + keep Supabase)

Lowest risk, keeps every Supabase feature the app relies on, and gets us off the fragile
VPS + cloudflared + `:8443` workaround.

### 1a. Backend → **Cloud Run**
- Containerize `app.main:app` (Dockerfile: python:3.12-slim + `requirements.txt` + uvicorn/gunicorn).
- Deploy to **Cloud Run** (fully managed, autoscaling, HTTPS + managed TLS, custom domain
  `api.kuasa.tech` — replaces nginx + cloudflared + the `:8443` hack).
- **Embeddings caveat (the main design decision):** the `sentence-transformers` model + torch make
  a large image and a multi-second cold start.
  - **Option A (recommended):** bake the model into the image (download at build time), run CPU-only
    torch (`torch` CPU wheel — much smaller than the CUDA build now in the venv), set
    **`min-instances=1`** so the model stays warm. Memory ~2–4 GB, 1–2 vCPU.
  - **Option B:** split embeddings into a separate Cloud Run service (scale independently; keep the
    API image slim).
  - **Option C (avoid unless needed):** switch to **Vertex AI text embeddings** — managed, no torch —
    BUT it changes the embedding space, so **every vector in `syllabus_embeddings` must be
    re-ingested**, and multilingual BM/ZH quality must be re-validated. Only if we want zero local ML.
- LLM providers stay external (Cerebras/OpenRouter/Groq/DeepSeek) — no change.
- `edge-tts` runs fine in-process on Cloud Run.

### 1b. Secrets → **Secret Manager**
- Move everything from `.env` (SUPABASE_KEY, CEREBRAS/OPENROUTER/GROQ/DEEPSEEK keys, PEXELS,
  TELEGRAM, SUPABASE_ACCESS_TOKEN) into **Secret Manager**; mount as env vars on the Cloud Run
  service. Removes plaintext `.env` from the box. (Also resolves the leaked-`GKEY` class of problem.)

### 1c. Media/TTS storage → keep Supabase Storage, or **GCS** (optional)
- Simplest: keep audio in Supabase Storage (no code change).
- Cleaner-on-GCP: move to a **Cloud Storage** bucket behind Cloud CDN; update the TTS upload path
  in `agents/orchestrator.py`. Optional, low priority.

### 1d. Observability → **Cloud Logging / Monitoring / Trace**
- Cloud Run logs to Cloud Logging automatically. Keep the `agent_traces` table for app-level spans;
  optionally export `TraceMiddleware` spans to **Cloud Trace**. Add uptime checks + alerting
  (complements the existing Telegram digest).

### 1e. CI/CD → **Cloud Build + Artifact Registry**
- GitHub trigger on the **clean branch** → Cloud Build builds the image → pushes to **Artifact
  Registry** → deploys to Cloud Run. (Frontend build separately; see 1f.)

### 1f. Frontend (optional in the hybrid)
- Simplest: **leave the frontend on Cloudflare Workers** (it's already built for that) and only
  move the backend. Least churn.
- Or move SSR to **Cloud Run** (Node server build) with static assets on **Firebase Hosting / Cloud
  CDN**. Do this only if consolidating everything on GCP.

**Result:** Supabase unchanged (Auth/RLS/Realtime/Storage all keep working); backend is managed,
autoscaling, on a real domain with managed TLS; secrets centralized; CI/CD automated.

---

## 2. Full-GCP option (only if leaving Supabase is mandatory)

Large lift — do **not** undertake without an explicit decision. Each Supabase feature must be replaced:

| Supabase feature | GCP replacement | Effort / risk |
|---|---|---|
| Postgres + pgvector | **Cloud SQL for PostgreSQL** (+ `pgvector` extension) or **AlloyDB** (better vector perf) | Medium — data migration + re-point connection |
| Auth (JWT) | **Identity Platform** (Firebase Auth) | **High** — reissue all users, rewrite token verification in `require_admin`/`require_teacher` |
| **RLS policies** | Move authz into the app / Cloud SQL policies | **High** — RLS is doing real security work today; must be re-implemented server-side |
| Realtime | **Pub/Sub** + client subscriptions, or drop | Medium — classroom live updates |
| Storage | **Cloud Storage** | Low |
| PostgREST (frontend direct writes) | Route all writes through the FastAPI backend | **High** — frontend currently writes prefs directly; every direct query becomes an API endpoint |
| Edge functions | Cloud Functions / Cloud Run | Low–Medium |

Because Auth + RLS + direct-PostgREST are woven through both tiers, full migration is effectively a
**re-platform of the data/security layer**, not a lift-and-shift. Recommendation: stay hybrid unless
a compliance/ownership requirement forces full-GCP.

---

## 3. Phased rollout (hybrid)

- **Phase 1 — Containerize + deploy backend.** Dockerfile (CPU torch + baked model), push to
  Artifact Registry, deploy to Cloud Run (`min-instances=1`), wire Secret Manager. Test against the
  existing Supabase project. No traffic cutover yet.
- **Phase 2 — Cutover domain.** Point `api.kuasa.tech` at Cloud Run (managed TLS); retire nginx +
  cloudflared + `:8443`. Update frontend `VITE_API_BASE_URL` if the host changes.
- **Phase 3 — CI/CD.** Cloud Build GitHub trigger on `cleanup/pushable-base` → auto build/deploy.
- **Phase 4 — Observability.** Cloud Logging dashboards, uptime checks, alerting.
- **Phase 5 (optional) — Media to GCS; frontend to Cloud Run/Firebase.**
- **Phase 6 (only if mandated) — Full DB/auth migration off Supabase** (§2), behind an explicit
  decision gate.

---

## 4. Risks & cost notes

- **Cold starts:** the embedding model dominates. `min-instances=1` avoids user-facing cold starts
  (~small always-on cost). Without it, first-request latency spikes while torch loads the model.
- **Image size:** switch the venv's **CUDA torch → CPU torch wheel** for Cloud Run (no GPU there);
  cuts the image from multi-GB. GPU on Cloud Run/GKE is unnecessary — LLMs are external and the
  embedding model runs fine on CPU.
- **LLM cost unchanged:** providers stay external; Cerebras free tier etc. still apply.
- **Data residency:** Cloud SQL/AlloyDB let you pin region (e.g. `asia-southeast1` Singapore) for
  Malaysian users — a plus if full-GCP is ever chosen.
- **Don't break RLS:** in hybrid we keep Supabase, so the new teacher-write RLS and all policies
  keep working untouched. This is a strong reason to prefer hybrid.
- **CI/CD source:** build from `cleanup/pushable-base` (the fat history can't be pushed/cloned).

---

## 5. Concrete first step

Write a `Dockerfile` + `.dockerignore` (exclude `venv/`, `data/`, `.git/`) for the backend, build
locally, and run the container against the current Supabase project to prove the FastAPI + LangGraph
+ local-embeddings stack starts cleanly in a slim CPU image. Everything else follows from a working
container image.
