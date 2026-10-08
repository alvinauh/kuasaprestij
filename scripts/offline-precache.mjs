// Offline app precache list (used by the offlinePrecache plugin in vite.config.ts
// when VITE_OFFLINE_APP=1). Runs on the client build output, before Nitro indexes
// the public files, so the server serves the manifest.
//
// precache-manifest.json lists every file the service worker downloads at install,
// so the app opens with no internet. The AI runtime (.wasm, ~22 MB) is left out:
// it is cached only when a student downloads the optional offline AI helper.
import { existsSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

const SKIP = [/^sw\.js$/, /^precache-manifest\.json$/, /\.wasm$/, /\.map$/];

function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

function list(dir) {
  return walk(dir).map((p) => [relative(dir, p).split(sep).join("/"), statSync(p).size]);
}

/** outDir: client build output; publicDir: source public/ (Nitro copies it in later). */
export function writePrecache(outDir, publicDir, buildId) {
  const sizes = new Map([...list(publicDir), ...list(outDir)]);
  const files = [...sizes.keys()].filter((f) => !SKIP.some((re) => re.test(f))).sort();
  const bytes = files.reduce((n, f) => n + sizes.get(f), 0);
  writeFileSync(
    join(outDir, "precache-manifest.json"),
    JSON.stringify({ build: buildId, bytes, files: files.map((f) => `/${f}`) }),
  );
  console.log(`[offline-precache] build ${buildId}: ${files.length} files, ${(bytes / 1048576).toFixed(1)} MB precached`);
}
