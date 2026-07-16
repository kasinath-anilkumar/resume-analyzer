/*
 * Parakkat ATS — minimal, safe service worker.
 *
 * Purpose: make the app installable (PWA) and resilient to flaky networks —
 * WITHOUT ever serving stale app code or touching the API.
 *
 * Strategy:
 *   - Only same-origin GET requests are handled. The backend API lives on a
 *     DIFFERENT origin, so auth/data requests never pass through here.
 *   - Navigations (HTML): network-first, falling back to the cached shell only
 *     when offline. You always get fresh HTML when online, so deploys aren't
 *     shadowed by a stale cache.
 *   - Static assets (Vite content-hashed JS/CSS/fonts/images): stale-while-
 *     revalidate — instant from cache, refreshed in the background. Safe
 *     because a new build ships new hashed filenames.
 *
 * Bump CACHE_VERSION to force-drop old caches on the next activation.
 */
const CACHE_VERSION = 'v1';
const CACHE = `parakkat-ats-${CACHE_VERSION}`;
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/app-icon.svg', '/favicon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Only same-origin GETs. Everything else (API, POST, cross-origin) goes
  // straight to the network, untouched.
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // HTML navigations: network-first so new deploys are picked up immediately.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('/index.html', copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match('/index.html').then((r) => r || caches.match('/')))
    );
    return;
  }

  // Static assets: stale-while-revalidate.
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.status === 200 && res.type === 'basic') {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
