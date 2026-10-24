# KuasaPrestij — migrate to a new server

Move the **source + secrets + PDF corpus** and rebuild on the target. Do **not**
`docker save`/`load` images — nothing is built yet on the old box, and the backend
image (torch + sentence-transformers) is multi-GB. Rebuilding from source is cleaner
and portable.

## What the stack is

Three-container compose stack (already authored, never yet run):

- **backend** — FastAPI/uvicorn, `python:3.11-slim`, `app.main:app` on :8001
- **frontend** — `node:22-slim`, TanStack/Vite dev server on :3000 (repo: learn-play-shine-96)
- **nginx** — reverse proxy on :80, config `deploy/nginx-docker.conf`

Persistent app/user state lives **externally in Supabase** (see the frontend `.env`),
so it follows the app automatically — moving servers does not move that data.
*(Confirm the backend's datastore before assuming zero local state.)*

## What moves vs. what does NOT

| Move it | How |
|---|---|
| `kuasaprestij` repo | `git clone git@github.com:alvinauh/kuasaprestij.git` |
| `learn-play-shine-96` repo (frontend) | `git clone git@github.com:alvinauh/learn-play-shine-96.git` |
| `kuasaprestij/.env` | scp — git-ignored, will NOT come via clone |
| `learn-play-shine-96/.env` | scp — git-ignored, will NOT come via clone |
| `kuasaprestij/data/` — **158 textbook PDFs, ~6 GB** | rsync (only if ingestion must re-run on the new box) |

**Do NOT move** (all regenerate during build): `venv/` (5.4 GB), `node_modules/`,
`__pycache__/`, `data/.cache/huggingface/` (model cache), cloudflared leftovers,
screenshots, working-notes markdown.

## Target layout

The compose default expects the two repos side-by-side under a common parent:

    <parent>/kuasaprestij
    <parent>/frontend/learn-play-shine-96      # FRONTEND_CONTEXT default: ../frontend/learn-play-shine-96

Keep that shape, or override `FRONTEND_CONTEXT` when bringing the stack up.

## Steps (run ON THE NEW SERVER unless noted)

    # 1. Clone both repos into the expected layout
    mkdir -p ~/frontend
    git clone git@github.com:alvinauh/kuasaprestij.git ~/kuasaprestij
    git clone git@github.com:alvinauh/learn-play-shine-96.git ~/frontend/learn-play-shine-96

    # 2. Copy the two git-ignored .env files FROM the old box (run from OLD box, or scp-pull)
    scp OLD_HOST:/root/kuasaprestij/.env                         ~/kuasaprestij/.env
    scp OLD_HOST:/root/frontend/learn-play-shine-96/.env         ~/frontend/learn-play-shine-96/.env

    # 3. Copy the PDF corpus, EXCLUDING the regenerable HF cache (only if re-ingesting)
    rsync -avh --exclude='.cache/' \
      OLD_HOST:/root/kuasaprestij/data/  ~/kuasaprestij/data/

    # 4. Build and launch
    cd ~/kuasaprestij
    docker compose up -d --build

    # 5. Verify
    docker compose ps
    curl -s localhost/docs -o /dev/null -w '%{http_code}\n'   # expect 200

## Notes for the new server

- **Port 80 is free** there (no caddy competing), so nginx binds `:80` cleanly —
  the conflict that blocks it on the old box does not apply.
- **Disk**: the backend build pulls torch (~multi-GB). Ensure the target has headroom
  (the old box is at 95%, which is why we build on the new one).
- **TLS/443**: currently commented out in both compose and nginx conf. Enable the 443
  block + mount certs (or front with a Cloudflare tunnel) once DNS points at the new box.
- The sentence-transformers model downloads into the `kuasa-models` named volume on
  first use — no need to copy it.

## Decommission the old box (after verifying the new one serves traffic)

    cd /root/kuasaprestij            # nothing running to stop (never built here)
    rm -rf /root/learn-play-shine-96 # stale duplicate frontend (612 MB) — NOT the one in use
