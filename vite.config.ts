// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import type { Plugin } from "vite";
import { existsSync } from "fs";
// @ts-expect-error plain .mjs build script, no type declarations
import { writePrecache } from "./scripts/offline-precache.mjs";

// TanStack Start's SSR file scanner can pick up extensionless files (e.g. Dockerfile)
// and pass them through Vite's transform pipeline, where plugin:vite:import-analysis
// fails because they aren't valid JavaScript. Return an empty module for files
// with no extension so the scanner doesn't error.
//
// IMPORTANT: must check existsSync — otherwise URL paths like /settings, /health
// (which also have no extension) get intercepted and served as empty source maps,
// breaking direct navigation to those routes on the dev server.
const ignoreExtensionlessFiles: Plugin = {
  name: "vite-ignore-extensionless-files",
  enforce: "pre",
  load(id) {
    const clean = id.split("?")[0];
    if (!/\.[^/\\]+$/.test(clean) && existsSync(clean)) return { code: "", map: null };
  },
};

// Offline app build (VITE_OFFLINE_APP=1, cloudbuild-offline.yaml): after the client
// bundle is written, list every file for the service worker to precache. Runs
// before Nitro indexes the public files, so the server serves the list.
// VITE_BUILD_ID names this build: the offline app registers /sw.js?v=<id>, so each
// deploy installs a new service worker (src/routes/__root.tsx).
process.env.VITE_BUILD_ID ??= Date.now().toString(36);
const offlinePrecache: Plugin = {
  name: "offline-precache",
  apply: "build",
  applyToEnvironment: (env) => env.name === "client",
  writeBundle(options) {
    if (process.env.VITE_OFFLINE_APP !== "1" || !options.dir) return;
    writePrecache(options.dir, this.environment.config.publicDir, process.env.VITE_BUILD_ID);
  },
};

// Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
// @cloudflare/vite-plugin builds from this — wrangler.jsonc main alone is insufficient.
export default defineConfig({
  // Build-only (ignored by `vite dev`, so the VPS is unaffected): Cloud Run serves
  // `node .output/server/index.mjs`. The Lovable default target is Cloudflare Workers.
  // noExternals bundles every dependency into .output, so the runtime image needs no
  // node_modules; without it the build fails loading nf3's CommonJS @vercel/nft.
  nitro: { preset: "node-server", noExternals: true },
  tanstackStart: {
    server: { entry: "server" },
  },
  // Dev server runs behind a proxy in prod-stopgap deployments (VPS nginx, and the
  // parallel Cloud Run test instance on *.run.app). Vite 7 blocks unknown Host
  // headers by default; allow all since these are public frontends. Dev-only —
  // has no effect on the Cloudflare Workers build.
  // DISABLE_HMR=1: for running `vite dev` behind Cloud Run, whose request timeout drops
  // the HMR websocket; the Vite client then reloads the page about once a minute.
  // Cloud Run now serves the production build, so nothing sets it today. The VPS keeps
  // HMR so edits still go live.
  vite: {
    server: { allowedHosts: true, ...(process.env.DISABLE_HMR === "1" ? { hmr: false, ws: false } : {}) },
    plugins: [ignoreExtensionlessFiles, offlinePrecache],
  },
});
