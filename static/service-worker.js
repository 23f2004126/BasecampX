/**
 * TMA service worker: keeps the app shell in a cache so the app opens fast and
 * still loads when the server can't be reached.
 *
 * Never cached (always the network): /api/ requests, the login video, CSV exports.
 * Everything else same-origin + the CDN libraries is the "app shell":
 *   - CDN files have the version in their URL, so they're cache-first.
 *   - Our own files are stale-while-revalidate: instant from cache, refreshed
 *     in the background. On localhost they're network-first instead, so code
 *     edits show up on a normal refresh during development.
 *
 * To force every installed copy to drop its old files, bump CACHE_VERSION.
 */
const CACHE_VERSION = 'v1';
const CACHE_NAME = `tma-shell-${CACHE_VERSION}`;
const IS_LOCAL = ['localhost', '127.0.0.1'].includes(self.location.hostname);

const CDN_HOSTS = ['unpkg.com', 'cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'];

// The page sends the rest (every JS module it loaded) right after registering;
// see the 'message' handler below.
const SHELL = [
  '/',
  '/static/css/theme.css',
  '/static/css/auth.css',
  '/static/css/style.css',
  '/static/js/app.js',
  '/static/js/router.js',
  '/static/js/api.js',
  '/static/js/store.js',
  '/static/manifest.json',
  '/static/img/login-bg-end.jpg',
  '/static/img/icons/icon-192.png',
  '/static/img/icons/icon-512.png',
  '/static/img/icons/icon-maskable-512.png',
  '/static/img/icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      // One by one: a single failed file must not stop the worker installing.
      .then((cache) => Promise.allSettled(SHELL.map((url) => cache.add(url))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.filter((n) => n.startsWith('tma-shell-') && n !== CACHE_NAME).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

function neverCache(url) {
  return url.origin === self.location.origin
    && (url.pathname.startsWith('/api/')
      || url.pathname.startsWith('/static/media/')
      || url.pathname.startsWith('/static/exports/')
      || url.pathname === '/service-worker.js');
}

// A first visit loads its files before this worker takes control, so they never
// pass through 'fetch'. The page lists them here so the first visit is cached too.
self.addEventListener('message', (event) => {
  if (event.data?.type !== 'CACHE_URLS') return;
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => Promise.allSettled(
    event.data.urls
      .filter((href) => {
        const url = new URL(href);
        return !neverCache(url) && (url.origin === self.location.origin || CDN_HOSTS.includes(url.hostname));
      })
      .map((href) => cache.match(href).then((hit) => hit || cache.add(href))),
  )));
});

async function store(request, response) {
  if (response.ok || response.type === 'opaque') {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, response.clone());
  }
  return response;
}

async function networkFirst(request, fallback) {
  try {
    return await store(request, await fetch(request));
  } catch (error) {
    const cached = await caches.match(fallback || request);
    if (cached) return cached;
    throw error;
  }
}

async function cacheFirst(request) {
  return (await caches.match(request)) || store(request, await fetch(request));
}

async function staleWhileRevalidate(event) {
  const refresh = fetch(event.request).then((response) => store(event.request, response));
  const cached = await caches.match(event.request);
  if (cached) {
    event.waitUntil(refresh.catch(() => {}));
    return cached;
  }
  return refresh;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (neverCache(url)) return; // not intercepted: goes straight to the network

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, '/'));
  } else if (CDN_HOSTS.includes(url.hostname)) {
    event.respondWith(cacheFirst(request));
  } else if (url.origin === self.location.origin) {
    event.respondWith(IS_LOCAL ? networkFirst(request) : staleWhileRevalidate(event));
  }
});
