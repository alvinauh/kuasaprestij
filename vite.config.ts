// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import type { Plugin } from "vite";

// TanStack Start's SSR file scanner can pick up extensionless files (e.g. Dockerfile)
// and pass them through Vite's transform pipeline, where plugin:vite:import-analysis
// fails because they aren't valid JavaScript. Return an empty module for files
// with no extension so the scanner doesn't error.
const ignoreExtensionlessFiles: Plugin = {
  name: "vite-ignore-extensionless-files",
  enforce: "pre",
  load(id) {
    const clean = id.split("?")[0];
    // Only intercept files with NO extension (Dockerfile, Makefile, etc.)
    if (!/\.[^/\\]+$/.test(clean)) return { code: "", map: null };
  },
};

// Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
// @cloudflare/vite-plugin builds from this — wrangler.jsonc main alone is insufficient.
export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  // Dev server runs behind a proxy in prod-stopgap deployments (VPS nginx, and the
  // parallel Cloud Run test instance on *.run.app). Vite 7 blocks unknown Host
  // headers by default; allow all since these are public frontends. Dev-only —
  // has no effect on the Cloudflare Workers build.
  vite: {
    server: { allowedHosts: true },
    plugins: [ignoreExtensionlessFiles],
  },
});
