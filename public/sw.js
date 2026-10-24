// Skor PWA — Service Worker
//
// Offline app build (Cloud Run `kuasaprestij-offline`): at install, precaches every
// file of the production build listed in /precache-manifest.json (written by
// scripts/offline-precache.mjs), so the app opens with no internet. Every page
// URL serves the same app shell ('/'), and the client router takes over.
//
// Main site (vite dev on the VPS) has no manifest: it keeps the light behaviour,
// caching only the shell and static files it has seen.

// The offline app registers /sw.js?v=<build id>&offline=1 (src/routes/__root.tsx):
// a new build id is a new script URL, so each deploy installs a fresh worker and
// precache. The main site registers plain /sw.js.
const SW_PARAMS = new URL(self.location.href).searchParams;
const BUILD_ID = SW_PARAMS.get('v') || 'v1';
const IS_OFFLINE_BUILD = SW_PARAMS.get('offline') === '1';
const CACHE_VERSION = `skor-${BUILD_ID}`;
const RUNTIME_CACHE = 'skor-runtime';   // AI runtime files fetched from jsdelivr
const SHELL_URL = '/';

// Hostnames that must always go to the network — never cache these.
const PASSTHROUGH_HOSTS = [
  'api.kuasa.tech',
  'supabase.co',          // Supabase REST + auth + realtime
  'run.app',              // Cloud Run backend
  'assets.kuasa.tech',    // Cloudflare R2
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'huggingface.co',       // offline AI model shards (Transformers.js caches these itself)
  'hf.co',
];

// Caches owned by other code — never prune these on activate.
const KEEP_CACHES = ['transformers-cache', RUNTIME_CACHE];

function isPassthrough(url) {
  return url.origin !== self.location.origin && PASSTHROUGH_HOSTS.some((h) => url.hostname.endsWith(h));
}

function isStaticAsset(url) {
  return /\.(js|mjs|css|woff2?|ttf|otf|png|svg|ico|webp|jpg|jpeg|gif|avif|wasm|webmanifest)(\?.*)?$/.test(url.pathname);
}

// onnxruntime-web loads its .mjs/.wasm glue from jsdelivr; keep them for offline AI.
function isAiRuntime(url) {
  return url.hostname === 'cdn.jsdelivr.net' && url.pathname.includes('onnxruntime-web');
}

async function precache() {
  const cache = await caches.open(CACHE_VERSION);
  let files = [];
  try {
    if (!IS_OFFLINE_BUILD) throw new Error('main site');
    const res = await fetch('/precache-manifest.json', { cache: 'no-store' });
    if (res.ok) files = (await res.json()).files ?? [];
  } catch { /* no manifest (main site / dev server): shell only */ }
  // The shell must succeed or the app can't open offline; assets are retried
  // individually so one failed file doesn't abort the whole install.
  await cache.add(new Request(SHELL_URL, { cache: 'reload' }));
  const results = await Promise.allSettled(
    files.map((f) => cache.add(new Request(f, { cache: 'reload' }))),
  );
  const failed = results.filter((r) => r.status === 'rejected').length;
  if (failed) console.warn(`[Skor SW] ${failed}/${files.length} files failed to precache`);
}

self.addEventListener('install', (event) => {
  event.waitUntil(precache());
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_VERSION && !KEEP_CACHES.includes(k)).map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// Network with a time limit, so a weak signal falls back to the cache quickly.
function fetchWithTimeout(request, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    fetch(request).then((r) => { clearTimeout(timer); resolve(r); }, (e) => { clearTimeout(timer); reject(e); });
  });
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;
  if (!url.protocol.startsWith('http')) return;

  if (isAiRuntime(url)) {
    event.respondWith(
      caches.open(RUNTIME_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        const res = await fetch(request);
        if (res.ok) cache.put(request, res.clone());
        return res;
      })
    );
    return;
  }

  if (isPassthrough(url) || url.origin !== self.location.origin) return;

  // Precache list + this file must always come from the network.
  if (url.pathname === '/precache-manifest.json' || url.pathname === '/sw.js') return;

  // Hashed build files (/assets/) never change: cache first, fill on a miss.
  if (url.pathname.startsWith('/assets/') || (IS_OFFLINE_BUILD && isStaticAsset(url))) {
    event.respondWith(
      caches.open(CACHE_VERSION).then(async (cache) => {
        const cached = await cache.match(request, { ignoreSearch: url.pathname.startsWith('/assets/') });
        if (cached) return cached;
        try {
          const res = await fetch(request);
          if (res.ok) cache.put(request, res.clone());
          return res;
        } catch (err) {
          const any = await caches.match(request);
          if (any) return any;
          throw err;
        }
      })
    );
    return;
  }

  // Unhashed static files (main site's vite dev, e.g. /src/styles.css): network
  // first so edits show up, cached copy only when the network fails.
  if (isStaticAsset(url)) {
    event.respondWith(
      fetch(request).then((res) => {
        if (res.ok) {
          const copy = res.clone();   // clone before the page reads the body
          caches.open(CACHE_VERSION).then((c) => c.put(request, copy));
        }
        return res;
      }).catch(() => caches.match(request))
    );
    return;
  }

  // Pages: network first (fresh deploys), cached shell when offline or slow.
  if (request.mode === 'navigate') {
    event.respondWith(
      (IS_OFFLINE_BUILD ? fetchWithTimeout(request, 4000) : fetch(request)).catch(async () => {
        const shell = await caches.match(SHELL_URL);
        return shell || new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
      })
    );
    return;
  }

  event.respondWith(fetch(request).catch(() => caches.match(request)));
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
