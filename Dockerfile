# KuasaPrestij frontend (TanStack Start + Vite).
#
# ┌─────────────────────────────────────────────────────────────────────────┐
# │ STOPGAP: this image runs `vite dev`, matching how the box serves prod    │
# │ today (deploy/kuasaprestij-frontend.service). It pins Node + deps so a    │
# │ fresh VM is reproducible, but it is still a DEV server — a container       │
# │ restart drops the HMR socket and reloads live clients (WORKSPACE B1).     │
# │                                                                           │
# │ TIER 2 (real fix): once the Nitro `node-server` build works (the Lovable  │
# │ vite config currently forces the Cloudflare Workers target), replace the  │
# │ single stage below with the multi-stage build at the bottom of this file  │
# │ and serve the built Node server instead of vite dev.                      │
# └─────────────────────────────────────────────────────────────────────────┘
FROM node:22-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

EXPOSE 3000

# --host 0.0.0.0 so a proxy (VPS nginx) or Cloud Run's front end can reach it.
# .env is .dockerignore'd, so on Cloud Run we materialise VITE_API_BASE_URL from
# the injected env var before Vite starts (Vite reads it from .env at dev boot).
# Honor $PORT when Cloud Run sets it; default 3000 for local/VPS.
CMD ["sh", "-c", "env | grep '^VITE_' > .env || true; exec npm run dev -- --host 0.0.0.0 --port ${PORT:-3000}"]

# ── TIER 2 replacement (uncomment once `npm run build` produces a Node server) ──
# FROM node:22-slim AS build
# WORKDIR /app
# COPY package*.json ./
# RUN npm ci
# COPY . .
# # Requires the Nitro preset switched from cloudflare-module to node-server.
# RUN npm run build
#
# FROM node:22-slim AS run
# WORKDIR /app
# ENV NODE_ENV=production PORT=3000
# COPY --from=build /app/.output ./.output
# EXPOSE 3000
# CMD ["node", ".output/server/index.mjs"]
