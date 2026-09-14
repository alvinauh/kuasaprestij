# Deploy Runbook — KuasaPrestij

Two ways to run the stack. **Docker Compose** is the portable path (use this for a
new VM / GCP migration). The **host + systemd** units are the current VPS setup.

External state (no migration needed): Supabase (DB, pgvector, storage `media_bucket`),
the LLM providers, Pexels, and the `cdn.kuasaprestij.tech` fallback assets are all
off-box. A migration is really just: move the two repos + secrets + reverse proxy.

---

## A. Docker Compose (portable — recommended for a new VM)

Layout expected on the box (two repos under a common parent):

```
~/kuasaprestij/                    # this repo (backend + compose + nginx)
~/frontend/learn-play-shine-96/    # frontend repo   (or set FRONTEND_CONTEXT)
```

```bash
# 1. Clone both repos.
git clone <backend-remote> kuasaprestij
git clone <frontend-remote> frontend/learn-play-shine-96

# 2. Fill in secrets (never commit the real .env files).
cd kuasaprestij
cp .env.example .env                                   # backend keys
cp ../frontend/learn-play-shine-96/.env.example \
   ../frontend/learn-play-shine-96/.env                # frontend VITE_* vars
# ...edit both...

# 3. Bring it up (build images + start backend, frontend, nginx).
docker compose up -d --build

# App on :80. Logs:
docker compose logs -f backend
docker compose logs -f frontend
```

If the frontend repo is elsewhere:
`FRONTEND_CONTEXT=/path/to/frontend docker compose up -d --build`

### Known limitation (Tier 2)
The frontend image runs `vite dev` — same as the box today. It is reproducible but
still a dev server (restart drops HMR → live clients reload). The real fix is the
Nitro `node-server` build; swap in the multi-stage block in the frontend `Dockerfile`
once `npm run build` produces a Node server (the Lovable vite config currently forces
the Cloudflare Workers target — that's the blocker to resolve first).

### TLS
`nginx-docker.conf` serves :80. For HTTPS, mount certs and enable the 443 block
(uncomment the port + volume in `docker-compose.yml`), or terminate TLS upstream
(certbot on the host, or a GCP HTTPS load balancer with a managed cert).

---

## B. Host + systemd (current VPS)

Unit files live in `deploy/`. They hardcode `/root/kuasaprestij` and
`/root/frontend/learn-play-shine-96` — adjust `WorkingDirectory`/paths for a new box.

| Unit | Role |
|---|---|
| `kuasaprestij.service` | FastAPI (uvicorn `app.main:app`, port **8001**) |
| `kuasaprestij-frontend.service` | Vite dev, port 3000 |
| `kuasaprestij-nginx.service` | nginx TLS proxy on 8443 (`nginx-standalone.conf`) |
| `kuasaprestij-autosave.{service,timer}` | git autosave sweep (VPS-only workflow) |
| `kuasaprestij-*-pull.{service,timer}` | git auto-pull deploys (VPS-only workflow) |
| `kuasaprestij-seed.{service,timer}` | anchor pre-seeding |

```bash
sudo cp deploy/kuasaprestij*.service deploy/kuasaprestij*.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now kuasaprestij kuasaprestij-frontend kuasaprestij-nginx
```

The `*-pull` and `autosave` timers are the auto-deploy/backup workflow specific to
the VPS — decide whether they belong on the new box before enabling them.

---

## GCP VM (Compute Engine) checklist

- Reserve a **static external IP** (VM IP changes on stop/start otherwise).
- **VPC firewall**: allow only 80/443 from the internet; keep 8001/3000 internal
  behind nginx. (GCP ignores host `ufw` — rules are set at the project level.)
- Put the app on a **real domain** now and lower DNS TTL before cutover → the move
  becomes a single A-record change instead of a hardcoded `IP:3000`.
- Install Docker + compose plugin; then follow section A.
- Optional: a GCE **startup-script** to run `docker compose up -d` on boot, and
  **disk snapshots** for backup.
- Store secrets in **Secret Manager**; render to `.env` at deploy time.
