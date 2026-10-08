# Live Deployment — Access Notes & Open Decisions

_Last updated: 2026-07-17. Status: diagnosed; two decisions deferred by user._

## TL;DR
The app **is already live and publicly reachable** — but only at the exact URL
**`https://api.kuasa.tech:8443`** (the `:8443` is mandatory). Verified from
external probe nodes (FR/NL/IR/RS all got HTTP 200) and via a real browser over
the public URL (loads → `/login` → renders sign-in). "Others can't access it" is
a URL/exposure problem, not an outage.

## Why others can't reach it
1. **The `:8443` port is required.** Without it:
   - `https://api.kuasa.tech` (port 443) → **fails (000)** — port 443 on this box
     is owned by the *other* project's stack (`thesissifu` Caddy/Docker), which
     does not serve this app.
   - `https://kuasa.tech` (apex) → resolves to a **different server**
     (`185.158.133.1`), not this box.
   - Only `https://api.kuasa.tech:8443` works.
2. **Login wall** — redirects to Supabase sign-in. Anyone without an account (or
   the sign-up link) sees "can't get in."
3. **Non-standard port** — some school/corporate/mobile networks block outbound
   HTTPS on odd ports (8443), so a subset of users can't connect even with the
   right URL.

## Deeper "not a real deployment" issues
- Served by the **Vite dev server** (`npm run dev` on :3000), not a production
  build — works, but fragile/slow for public traffic (HMR overhead, host checks).
- Stuck on `:8443` because **80/443 are held by the `thesissifu` Docker/Caddy
  stack** — which must NOT be touched without explicit approval.

## Infra facts (verified 2026-07-17)
- Server public IP: **178.105.130.105**
- DNS: `api.kuasa.tech` → 178.105.130.105 (this box ✓); `kuasa.tech` →
  185.158.133.1 (different box ✗)
- Host firewall: **ufw inactive**; port 8443 confirmed **open externally** (no
  cloud-firewall block).
- TLS on 8443: valid **Let's Encrypt** cert for `api.kuasa.tech`
  (`/etc/ssl/kuasaprestij/`), exp ~2026-09-28.
- kuasaprestij nginx: `kuasaprestij.service`? no — HTTPS proxy is
  **`kuasaprestij-nginx.service`**, config `/root/kuasaprestij/deploy/nginx-standalone.conf`,
  listens **:8443**, proxies `/` → Vite :3000 and API paths → uvicorn :8001.
- Backend: `kuasaprestij.service` (uvicorn `app.main:app` on **:8001**, systemd-managed).
- Frontend: `kuasaprestij-frontend.service` (Vite dev on **:3000**).
- Ports 80/443: **docker-proxy → `thesissifu_project_caddy_1`** (do not touch).

## Open decisions (deferred — pick up later)

### 1. How to get a clean `:443` URL (443 is held by thesissifu Caddy)
- **Option A — Cloudflare in front (recommended, no touching thesissifu):**
  Put `api.kuasa.tech` behind Cloudflare; visitors use `https://api.kuasa.tech`
  (443), Cloudflare forwards to origin `:8443` via an Origin Rule (override
  origin port). Needs the domain on Cloudflare + DNS access. TLS handled by CF.
- **Option B — Add kuasaprestij to the existing Caddy on 443:** cleanest result,
  but edits the `thesissifu` stack (requires explicit approval).
- **Option C — Keep `:8443`, just harden:** accept the port, but replace the Vite
  dev server with a production build (`npm run build` → static `dist/` served by
  nginx). Fastest, no infra changes; ugly port + some networks block it.

### 2. Sign-up policy
- **Open sign-up** (anyone with the link registers — sign-up already exists), or
- **Invite-only** (hand out credentials; login wall intended).

## Recommended next steps (regardless of URL choice)
1. Switch frontend from Vite dev server → production build served by nginx.
2. Decide + implement the clean-URL path (A/B/C above).
3. Decide sign-up policy.
4. (Nice-to-have) fix the `favicon.ico` 404.
