# Offline / Installable App — Diagnosis & Plan (2026-10-07)

## 1. Why the Offline Pack fails with internet off

**Symptom (user test):** the Offline Pack is downloaded, internet switched off → app does not work.

**Reproduced** (Playwright, Chromium, `localhost:3000`; script: load `/` twice so the SW controls the page, then `setOffline(true)` and navigate):

```
cached entries in skor-v1: 143
== offline /          → blank page (body text empty)
== offline /dashboard → blank page
failed requests (both):
  /@tanstack-start/styles.css?routes=__root__%2C%2F   net::ERR_FAILED
  /@id/virtual:tanstack-start-dev-client-entry        net::ERR_FAILED
```

**Root cause: the app never boots offline, so the model is never reached.**
The model and pack are fine. The app shell is broken offline.

1. **Live frontend is the Vite *dev* server.** It serves hundreds of unbundled modules with
   dev-only URLs (`/@id/virtual:…`, `/@tanstack-start/styles.css?routes=…`, `?t=<timestamp>&v=<hash>`).
2. **`public/sw.js` only caches what it recognises.** `isStaticAsset()` matches `.js/.css/…`
   extensions. The TanStack dev client entry (`/@id/virtual:tanstack-start-dev-client-entry`, no
   extension) and the per-route stylesheet fall into the "network, fallback to cache" branch, which
   **never writes to the cache**. Offline, those two requests fail, so hydration never starts and the page stays blank.
3. Even if those were cached, dev URLs change whenever Vite restarts or re-optimises deps (`?t=`,
   `?v=` change), so yesterday's cache would miss today.
4. **Every offline navigation returns the cached `/` HTML** (SSR app). Deep links like `/dashboard`
   depend on the client router recovering, which can't happen when (2) fails.

Secondary issues, which will show once the shell boots:
- `anchor_cache` only holds questions the student already saw online (`api.ts:832`). There is no
  pre-download of a subject's bank, so a new topic offline goes straight to the 0.5B model.
- Supabase session: an expired access token can't refresh offline. Auth-gated screens must treat
  "offline + cached session" as signed-in.
- Browser storage for the ~800 MB model can be evicted (Android under pressure; iOS after ~7 days).

**Conclusion:** a service worker patch on the dev server can't make this reliable. Offline needs a
real production build with a known file list, which is also the prerequisite for an installable app.

### 1b. What works on the current build (tested 2026-10-07, for the demo)

| Scenario | Result |
|---|---|
| Reload or open the app with internet off | ❌ blank page |
| Tab already open, model downloaded on an earlier visit, then internet off → offline AI question | ❌ "The offline AI worker failed to start" (`/src/workers/llm.worker.ts` isn't cached) |
| Same, but the model was loaded in this tab while online first | ⚠️ runs, but took **100 s** and returned broken JSON ("Could not parse model output"); the 0.5B model isn't usable |
| Tab already open, a topic the student opened online, internet off | ✅ by code path: serves the cached question from `anchor_cache` (one question per topic) — not UI-tested |
| Answer MCQ/short answer offline | ✅ by code path: queued, "N pending" badge, syncs on reconnect — not UI-tested; essays refuse offline |

## 2. Plan

| Step | What | Where it runs | Touches VPS? |
|---|---|---|---|
| 1 | **Client-only (SPA) build target**: static `index.html` + hashed assets; SW precaches the full file list at install | Cloud Build | No |
| 2 | **Content packs**: per subject/form/lang JSON of `topic_anchors`, generated from the Cloud SQL mirror, versioned; app downloads into IndexedDB | Cloud Build → R2 (`assets.kuasa.tech`) | No |
| 3 | **Installable app**: Capacitor Android APK wrapping step 1 (packs + app bundled; model downloaded once to app storage, not browser cache) | Cloud Build → R2 download link | No |
| 3b | Optional: native llama.cpp model instead of WASM (faster; allows Sailor2-1B) | APK | No |
| 4 | Optional: Windows build (Tauri/Electron) for school labs | Cloud Build | No |
| — | CORS allowlist `https://localhost` (Capacitor origin) + 1 API restart | VPS | **Yes, one line, ask first** |
| — | Supabase redirect URL for the app | Supabase dashboard | No |

Offline pieces already built carry over unchanged: `offlineDb.ts`, `syncQueue.ts`,
`useOnlineSync.ts`, the `api.ts` offline guards, and the `llm.worker.ts` model loader. Add sync jitter so many devices
reconnecting at once don't all flush to the VPS API in the same second.

## 3. VPS impact (answers to "will it affect the main app?")

- VPS disk is **95% full (7.3 GB free)** and RAM ~2.4 GB available. **Don't build the APK on the VPS**
  (Android SDK + Gradle ≈ 5–8 GB, 2–4 GB RAM).
- All builds run in **Cloud Build** and publish to **R2**. Nothing is copied back to the VPS.
- VPS auto-pull timers (`kuasaprestij-pull.timer`, `kuasaprestij-frontend-pull.timer`) are
  **inactive**, so pushes to GitHub don't restart anything on the VPS.
- Work happens in a **separate folder + branch `offline-app-deploy`** with its own Cloud Build trigger,
  **never** in `/root/frontend/learn-play-shine-96/` (HMR would take edits live instantly).
- The installed app only talks to the VPS API when online, using the same calls as the website.

## 4. Needed from the user

- Decide: **Capacitor APK** (recommended) vs Chrome "Install app" (PWA) only.
- Distribution: direct APK / school MDM vs Play Store.
- Create a Cloud Build trigger on branch `offline-app-deploy` (this server has no gcloud login; I'll provide the settings).
- R2 API token in Secret Manager for uploads.
