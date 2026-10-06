# KuasaPrestij frontend (TanStack Start + Vite) — production image for Cloud Run.
#
# Serves the built Nitro Node server (`nitro: { preset: "node-server" }` in
# vite.config.ts) instead of `vite dev`: no HMR socket (so no reload loop behind
# Cloud Run's request timeout), ~4x less to download per page, ~90 MB RAM.
# The VPS does not use this image; it keeps running `vite dev` for HMR edits.
#
# VITE_* values are baked into the client bundle at BUILD time, so they come in
# as build args (cloudbuild-frontend.yaml). Changing one means a rebuild.

FROM node:22-slim AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

ARG VITE_API_BASE_URL
ARG VITE_APP_URL
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL \
    VITE_APP_URL=$VITE_APP_URL \
    VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY

# The build runs out of memory at Node's default ~2 GB heap.
RUN NODE_OPTIONS=--max-old-space-size=6144 npm run build

FROM node:22-slim AS run
WORKDIR /app
ENV NODE_ENV=production PORT=3000
# noExternals: .output is self-contained, no node_modules needed.
COPY --from=build /app/.output ./.output
EXPOSE 3000
# Nitro listens on $PORT (Cloud Run sets it) on all interfaces.
CMD ["node", ".output/server/index.mjs"]
