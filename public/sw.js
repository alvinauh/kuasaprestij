// Skor PWA — Service Worker (Phase 1: App Shell Cache)
// Strategy: cache-first for static assets, network-only for API/Supabase,
// offline fallback to cached '/' for navigation.

const CACHE_VERSION = 'skor-v1';
const OFFLINE_URL = '/';

// Hostnames that must always go to the network — never cache these.
const PASSTHROUGH_HOSTS = [
  'api.kuasa.tech',
  'supabase.co',          // Supabase REST + auth + realtime
  'run.app',             // Cloud Run backend
  'assets.kuasa.tech',  // Cloudflare R2 (model downloads — streamed, not cached here)
  'fonts.googleapis.com',
  'fonts.gstatic.com',
];

function isPassthrough(url) {
  return PASSTHROUGH_HOSTS.some((h) => url.hostname.endsWith(h));
}

function isStaticAsset(url) {
  return /\.(js|mjs|css|woff2?|ttf|otf|png|svg|ico|webp|jpg|jpeg|gif|avif)(\?.*)?$/.test(url.pathname);
}

// ── Install: pre-cache the app shell ─────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.add(OFFLINE_URL))
  );
  self.skipWaiting();
});

// ── Activate: prune old caches ────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: routing strategy ───────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only intercept GET requests over http(s)
  if (request.method !== 'GET') return;
  if (!url.protocol.startsWith('http')) return;

  // API, Supabase, R2 — always network (these are not cacheable here)
  if (isPassthrough(url)) return;

  // Static assets: cache-first, update in background (stale-while-revalidate)
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.open(CACHE_VERSION).then(async (cache) => {
        const cached = await cache.match(request);
        const networkPromise = fetch(request).then((res) => {
          if (res.ok) cache.put(request, res.clone());
          return res;
        }).catch(() => null);

        return cached || networkPromise;
      })
    );
    return;
  }

  // Navigation (HTML pages): network-first, fall back to cached shell
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match(OFFLINE_URL).then((r) => r || new Response('Offline', { status: 503 }))
      )
    );
    return;
  }

  // Everything else: network with silent cache fallback
  event.respondWith(
    fetch(request).catch(() => caches.match(request))
  );
});

// ── Background sync message handler ──────────────────────────────────────────
// Phase 2 will post sync messages here when the student answers while offline.
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
